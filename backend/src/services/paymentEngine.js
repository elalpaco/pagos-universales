import prisma from "../lib/prisma.js";
import { config } from "../config.js";
import { audit } from "../lib/audit.js";
import { notify } from "../lib/notify.js";
import { decrypt } from "../lib/crypto.js";
import { idempotencyKey as buildIdempotencyKey } from "../lib/crypto.js";
import { bogotaParts, makeBogotaDate } from "../lib/dates.js";
import { getGateway, getBillerProvider, getPayoutProvider } from "../providers/index.js";
import { formatCop } from "../lib/format.js";

const ACTIVE_SPEND_STATUSES = ["CHARGED", "DISBURSING", "PAID"];

export function computeFee(amountCop) {
  const pct = Math.round((amountCop * config.feePercent) / 100);
  return pct + config.feeFixedCop;
}

export function computeTotal(amountCop) {
  const feeCop = computeFee(amountCop);
  return { feeCop, totalCop: amountCop + feeCop };
}

async function monthSpentCop(userId, referenceDate, excludePaymentId) {
  const p = bogotaParts(referenceDate);
  const start = makeBogotaDate(p.year, p.month, 1);
  const end = makeBogotaDate(p.month === 12 ? p.year + 1 : p.year, p.month === 12 ? 1 : p.month + 1, 1);
  const rows = await prisma.payment.findMany({
    where: {
      userId,
      status: { in: ACTIVE_SPEND_STATUSES },
      chargedAt: { gte: start, lt: end },
      ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}),
    },
    select: { totalCop: true },
  });
  return rows.reduce((sum, r) => sum + (r.totalCop || 0), 0);
}

function isCardExpired(pm, now) {
  const p = bogotaParts(now);
  if (!pm) return true;
  if (pm.expYear < p.year) return true;
  if (pm.expYear === p.year && pm.expMonth < p.month) return true;
  return false;
}

// Determina el monto a cobrar (fijo o consultando factura variable) y evalúa si requiere aprobación.
export async function resolveAmount(payment, service) {
  if (payment.amountCop != null) {
    const { feeCop, totalCop } = computeTotal(payment.amountCop);
    return { amountCop: payment.amountCop, feeCop, totalCop };
  }
  let amountCop;
  if (service.amountType === "FIXED") {
    amountCop = service.fixedAmountCop;
  } else {
    const billerProvider = getBillerProvider();
    const bill = await billerProvider.fetchBill(service, payment.periodKey);
    amountCop = bill.amountCop;
  }
  const { feeCop, totalCop } = computeTotal(amountCop);
  return { amountCop, feeCop, totalCop };
}

// Procesa un Payment SCHEDULED: resuelve monto, decide si requiere aprobación, y si no, cobra.
export async function processPayment(paymentId, now = new Date()) {
  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!payment) return null;
  if (!["SCHEDULED", "PENDING_APPROVAL"].includes(payment.status)) return payment;

  const service = await prisma.service.findUnique({ where: { id: payment.serviceId } });
  const user = await prisma.user.findUnique({ where: { id: payment.userId } });
  if (!service || !user) return payment;

  const { amountCop, feeCop, totalCop } = await resolveAmount(payment, service);

  let needsApproval = false;
  const reasons = [];
  if (service.maxAmountCop != null && amountCop > service.maxAmountCop) {
    needsApproval = true;
    reasons.push("supera el tope del servicio");
  }
  if (user.monthlyLimitCop != null) {
    const spent = await monthSpentCop(user.id, now, payment.id);
    if (spent + totalCop > user.monthlyLimitCop) {
      needsApproval = true;
      reasons.push("supera el límite mensual");
    }
  }

  if (needsApproval && payment.status !== "PENDING_APPROVAL") {
    const updated = await prisma.payment.updateMany({
      where: { id: payment.id, status: payment.status, version: payment.version },
      data: {
        amountCop,
        feeCop,
        totalCop,
        status: "PENDING_APPROVAL",
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) return prisma.payment.findUnique({ where: { id: payment.id } });
    await audit({
      userId: user.id,
      action: "PAYMENT_PENDING_APPROVAL",
      entity: "Payment",
      entityId: payment.id,
      data: { amountCop, reasons },
    });
    await notify(user.id, {
      type: "PAYMENT_PENDING_APPROVAL",
      title: "Un pago requiere tu aprobación",
      body: `El pago de ${service.customName || service.category} por ${formatCop(amountCop)} ${reasons.join(
        " y "
      )}. Revísalo en Aprobaciones.`,
    });
    return prisma.payment.findUnique({ where: { id: payment.id } });
  }

  // Persistir el monto resuelto antes de intentar el cobro.
  if (payment.amountCop == null || payment.status === "PENDING_APPROVAL") {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { amountCop, feeCop, totalCop },
    });
  }

  return attemptCharge(payment.id, now);
}

// Intenta cobrar un Payment (SCHEDULED o PENDING_APPROVAL ya aprobado). Usa lock optimista para
// que nunca dos workers cobren el mismo pago dos veces.
export async function attemptCharge(paymentId, now = new Date()) {
  const current = await prisma.payment.findUnique({ where: { id: paymentId } });
  if (!current) return null;
  if (!["SCHEDULED", "PENDING_APPROVAL"].includes(current.status)) return current;

  const lock = await prisma.payment.updateMany({
    where: { id: paymentId, status: current.status, version: current.version },
    data: { status: "CHARGING", version: { increment: 1 } },
  });
  if (lock.count === 0) {
    // Otro worker ya está procesando este pago.
    return prisma.payment.findUnique({ where: { id: paymentId } });
  }

  const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
  const service = await prisma.service.findUnique({ where: { id: payment.serviceId } });
  const user = await prisma.user.findUnique({ where: { id: payment.userId } });
  const explicitPmId = payment.paymentMethodId ?? service.paymentMethodId ?? null;
  const pm = explicitPmId ? await prisma.paymentMethod.findUnique({ where: { id: explicitPmId } }) : null;

  const paymentMethod =
    pm ||
    (await prisma.paymentMethod.findFirst({
      where: { userId: user.id, isDefault: true, status: "ACTIVE" },
    }));

  if (!paymentMethod || paymentMethod.status !== "ACTIVE" || isCardExpired(paymentMethod, now)) {
    return failPayment(payment, "No hay tarjeta activa/vigente para cobrar", now, {
      immediate: true,
    });
  }

  const gateway = getGateway();
  const idempotencyKey = buildIdempotencyKey(payment.serviceId, payment.periodKey, payment.attempts);
  let result;
  try {
    result = await gateway.charge({
      providerToken: decrypt(paymentMethod.providerTokenEnc),
      amountCop: payment.totalCop,
      reference: `${payment.serviceId}-${payment.periodKey}`,
      idempotencyKey,
      user,
    });
  } catch (err) {
    result = { ok: false, error: err?.message || "Error del gateway" };
  }

  if (result.ok) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "CHARGED",
        gatewayRef: result.gatewayRef,
        chargedAt: now,
        paymentMethodId: paymentMethod.id,
      },
    });
    await audit({
      userId: user.id,
      action: "PAYMENT_CHARGED",
      entity: "Payment",
      entityId: payment.id,
      data: { gatewayRef: result.gatewayRef, totalCop: payment.totalCop },
    });

    const payoutProvider = getPayoutProvider();
    await payoutProvider.enqueue(payment);
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "DISBURSING" } });
    await audit({
      userId: user.id,
      action: "PAYMENT_DISBURSING",
      entity: "Payment",
      entityId: payment.id,
      data: {},
    });
    await notify(user.id, {
      type: "PAYMENT_CHARGED",
      title: "Cobro exitoso",
      body: `Cobramos ${formatCop(payment.totalCop)} para ${service.customName || service.category}. Estamos gestionando el pago al facturador.`,
    });
    return prisma.payment.findUnique({ where: { id: payment.id } });
  }

  return failPayment(payment, result.error || "Cobro rechazado", now);
}

async function failPayment(payment, errorMessage, now, { immediate = false } = {}) {
  const attempts = payment.attempts + 1;
  const isFinal = immediate || attempts >= 3;

  if (isFinal) {
    await prisma.payment.update({
      where: { id: payment.id },
      data: { status: "FAILED", attempts, lastError: errorMessage, nextAttemptAt: null },
    });
    await audit({
      userId: payment.userId,
      action: "PAYMENT_FAILED",
      entity: "Payment",
      entityId: payment.id,
      data: { error: errorMessage, attempts },
    });
    await notify(payment.userId, {
      type: "PAYMENT_FAILED",
      title: "No pudimos completar un cobro",
      body: `El pago falló: ${errorMessage}. Puedes reintentarlo manualmente.`,
    });
    return prisma.payment.findUnique({ where: { id: payment.id } });
  }

  const delayHours = attempts === 1 ? 1 : 6;
  const nextAttemptAt = new Date(now.getTime() + delayHours * 3600000);
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "SCHEDULED", attempts, lastError: errorMessage, nextAttemptAt },
  });
  await audit({
    userId: payment.userId,
    action: "PAYMENT_RETRY_SCHEDULED",
    entity: "Payment",
    entityId: payment.id,
    data: { error: errorMessage, attempts, nextAttemptAt },
  });
  await notify(payment.userId, {
    type: "PAYMENT_RETRY",
    title: "Reintentaremos un cobro",
    body: `El cobro falló (${errorMessage}). Reintentaremos automáticamente.`,
  });
  return prisma.payment.findUnique({ where: { id: payment.id } });
}

export async function approvePayment(payment, now = new Date()) {
  if (payment.status !== "PENDING_APPROVAL") {
    throw new Error("El pago no está pendiente de aprobación");
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: { approvedAt: now },
  });
  await audit({
    userId: payment.userId,
    action: "PAYMENT_APPROVED",
    entity: "Payment",
    entityId: payment.id,
    data: {},
  });
  return attemptCharge(payment.id, now);
}

export async function skipPayment(payment) {
  if (!["SCHEDULED", "PENDING_APPROVAL"].includes(payment.status)) {
    throw new Error("Solo se pueden omitir pagos programados o pendientes de aprobación");
  }
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "SKIPPED" },
  });
  await audit({
    userId: payment.userId,
    action: "PAYMENT_SKIPPED",
    entity: "Payment",
    entityId: payment.id,
    data: {},
  });
  await notify(payment.userId, {
    type: "PAYMENT_SKIPPED",
    title: "Pago omitido",
    body: "Omitiste un pago programado.",
  });
  return updated;
}

export async function retryPayment(payment, now = new Date()) {
  if (payment.status !== "FAILED") {
    throw new Error("Solo se pueden reintentar pagos fallidos");
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "SCHEDULED", attempts: 0, nextAttemptAt: null, lastError: null },
  });
  await audit({
    userId: payment.userId,
    action: "PAYMENT_RETRY_MANUAL",
    entity: "Payment",
    entityId: payment.id,
    data: {},
  });
  return processPayment(payment.id, now);
}

export async function setPaymentAmount(payment, amountCop) {
  if (!["SCHEDULED", "PENDING_APPROVAL"].includes(payment.status)) {
    throw new Error("Solo se puede fijar el monto antes de cobrar");
  }
  const { feeCop, totalCop } = computeTotal(amountCop);
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { amountCop, feeCop, totalCop },
  });
  await audit({
    userId: payment.userId,
    action: "PAYMENT_AMOUNT_SET",
    entity: "Payment",
    entityId: payment.id,
    data: { amountCop },
  });
  return updated;
}

export async function completePayout(payment, { payoutRef, receiptUrl }, actorId) {
  if (payment.status !== "DISBURSING") {
    throw new Error("El pago no está en desembolso");
  }
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "PAID", payoutRef, payoutReceiptUrl: receiptUrl, paidAt: new Date() },
  });
  await audit({
    userId: payment.userId,
    actorId,
    action: "PAYOUT_COMPLETED",
    entity: "Payment",
    entityId: payment.id,
    data: { payoutRef, receiptUrl },
  });
  await notify(payment.userId, {
    type: "PAYMENT_PAID",
    title: "Pago completado",
    body: "Tu pago fue entregado al facturador exitosamente.",
  });
  return updated;
}

export async function failPayout(payment, reason, actorId) {
  if (payment.status !== "DISBURSING") {
    throw new Error("El pago no está en desembolso");
  }
  await prisma.payment.update({
    where: { id: payment.id },
    data: { status: "REFUND_PENDING", lastError: reason },
  });
  await audit({
    userId: payment.userId,
    actorId,
    action: "PAYOUT_FAILED",
    entity: "Payment",
    entityId: payment.id,
    data: { reason },
  });

  const gateway = getGateway();
  const refreshed = await prisma.payment.findUnique({ where: { id: payment.id } });
  let result = { ok: false };
  try {
    result = await gateway.refund({ gatewayRef: refreshed.gatewayRef, amountCop: refreshed.totalCop });
  } catch (err) {
    result = { ok: false, error: err?.message };
  }
  const finalStatus = result.ok ? "REFUNDED" : "REFUND_PENDING";
  const updated = await prisma.payment.update({
    where: { id: payment.id },
    data: { status: finalStatus },
  });
  await audit({
    userId: payment.userId,
    actorId,
    action: finalStatus === "REFUNDED" ? "PAYMENT_REFUNDED" : "PAYMENT_REFUND_PENDING",
    entity: "Payment",
    entityId: payment.id,
    data: {},
  });
  await notify(payment.userId, {
    type: "PAYMENT_REFUND",
    title: "Desembolso fallido",
    body: `No pudimos pagar al facturador (${reason}). ${
      finalStatus === "REFUNDED" ? "Se reembolsó el cobro." : "Estamos gestionando el reembolso."
    }`,
  });
  return updated;
}
