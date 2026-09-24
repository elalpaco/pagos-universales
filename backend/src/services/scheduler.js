import prisma from "../lib/prisma.js";
import { audit } from "../lib/audit.js";
import { notify } from "../lib/notify.js";
import { advanceDueDate, computeScheduledFor, periodKeyFor, bogotaParts } from "../lib/dates.js";
import { idempotencyKey as buildIdempotencyKey } from "../lib/crypto.js";
import { processPayment } from "./paymentEngine.js";
import { formatCop } from "../lib/format.js";

const REMINDER_DAYS_BEFORE = 3;

// Paso 1: asegura que exista un Payment SCHEDULED para el ciclo actual (nextDueDate) de cada
// servicio activo que no tenga ya uno pendiente, y avanza nextDueDate al siguiente vencimiento.
async function planServices(now) {
  const services = await prisma.service.findMany({ where: { status: "ACTIVE" } });
  let created = 0;
  for (const service of services) {
    // Un solo ciclo por delante: si ya hay un pago programado sin ejecutar, no planificar más.
    const pending = await prisma.payment.count({
      where: { serviceId: service.id, status: "SCHEDULED" },
    });
    if (pending > 0) continue;

    const dueDate = service.nextDueDate;
    const periodKey = periodKeyFor(dueDate, service.frequency);
    const scheduledFor = computeScheduledFor(dueDate, service.payDaysBefore);
    const idempotencyKey = buildIdempotencyKey(service.id, periodKey, 0);

    const existing = await prisma.payment.findUnique({
      where: { serviceId_periodKey: { serviceId: service.id, periodKey } },
    });

    if (!existing) {
      try {
        const payment = await prisma.payment.create({
          data: {
            userId: service.userId,
            serviceId: service.id,
            paymentMethodId: service.paymentMethodId,
            periodKey,
            dueDate,
            scheduledFor,
            amountCop: service.amountType === "FIXED" ? service.fixedAmountCop : null,
            idempotencyKey,
            status: "SCHEDULED",
          },
        });
        created += 1;
        await audit({
          userId: service.userId,
          action: "PAYMENT_PLANNED",
          entity: "Payment",
          entityId: payment.id,
          data: { periodKey, dueDate, scheduledFor },
        });
      } catch (err) {
        if (err.code !== "P2002") throw err;
      }
    }

    const nextDue = advanceDueDate(dueDate, service.dueDay, service.frequency);
    if (nextDue.getTime() !== dueDate.getTime()) {
      await prisma.service.update({ where: { id: service.id }, data: { nextDueDate: nextDue } });
    }
  }
  return created;
}

// Paso 2: ejecuta pagos programados cuya hora ya llegó.
async function executeDuePayments(now) {
  const due = await prisma.payment.findMany({
    where: {
      status: "SCHEDULED",
      scheduledFor: { lte: now },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: now } }],
    },
    select: { id: true },
  });
  for (const { id } of due) {
    await processPayment(id, now);
  }
  return due.length;
}

// Paso 3: recordatorios 3 días antes del cobro (una sola vez).
async function sendReminders(now) {
  const threshold = new Date(now.getTime() + REMINDER_DAYS_BEFORE * 86400000);
  const upcoming = await prisma.payment.findMany({
    where: {
      status: "SCHEDULED",
      reminderSentAt: null,
      dueDate: { lte: threshold, gte: now },
    },
    include: { service: true },
  });
  for (const payment of upcoming) {
    await prisma.payment.update({ where: { id: payment.id }, data: { reminderSentAt: now } });
    const amountText = payment.amountCop != null ? formatCop(payment.amountCop) : "monto por confirmar";
    await notify(payment.userId, {
      type: "PAYMENT_REMINDER",
      title: "Cobro próximo",
      body: `En los próximos días cobraremos ${amountText} para ${
        payment.service?.customName || payment.service?.category || "un servicio"
      }.`,
    });
  }
  return upcoming.length;
}

// Paso 4: marca tarjetas vencidas.
async function expireCards(now) {
  const p = bogotaParts(now);
  const methods = await prisma.paymentMethod.findMany({ where: { status: "ACTIVE" } });
  let expired = 0;
  for (const pm of methods) {
    const isExpired = pm.expYear < p.year || (pm.expYear === p.year && pm.expMonth < p.month);
    if (isExpired) {
      await prisma.paymentMethod.update({ where: { id: pm.id }, data: { status: "EXPIRED" } });
      expired += 1;
      await audit({
        userId: pm.userId,
        action: "PAYMENT_METHOD_EXPIRED",
        entity: "PaymentMethod",
        entityId: pm.id,
        data: {},
      });
      await notify(pm.userId, {
        type: "CARD_EXPIRED",
        title: "Tu tarjeta venció",
        body: `La tarjeta ${pm.brand} terminada en ${pm.last4} venció. Agrega una nueva para no perder tus pagos automáticos.`,
      });
    }
  }
  return expired;
}

// runTick es una función pura sobre la base de datos, parametrizada por `now`, para poder
// simular fechas desde las pruebas y desde el endpoint de administración.
export async function runTick(now = new Date()) {
  const planned = await planServices(now);
  const executed = await executeDuePayments(now);
  const reminders = await sendReminders(now);
  const expiredCards = await expireCards(now);
  return { now: now.toISOString(), planned, executed, reminders, expiredCards };
}

export default runTick;
