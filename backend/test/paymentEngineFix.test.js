// Regresión: bug BLOCKER "servicios FIXED nunca persisten totalCop" (paymentEngine.js).
// Antes del fix, processPayment solo persistía {amountCop, feeCop, totalCop} cuando
// payment.amountCop == null, pero un pago FIXED ya trae amountCop desde su creación (solo le
// falta feeCop/totalCop), así que nunca se persistía y quedaba cobrando con totalCop=null.
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from "vitest";

// vi.hoisted corre antes que los imports de abajo (que sí quedan hoisted por ser ESM estático),
// para que config.js lea una comisión != 0 y así la prueba distinga totalCop de amountCop.
vi.hoisted(() => {
  process.env.FEE_PERCENT = "10";
  process.env.FEE_FIXED_COP = "500";
});

import request from "supertest";
import { createApp } from "../src/app.js";
import prisma from "../src/lib/prisma.js";
import { resetDb } from "./dbUtils.js";
import { makeBogotaDate } from "../src/lib/dates.js";
import { computeFee, computeTotal, processPayment, attemptCharge } from "../src/services/paymentEngine.js";

const app = createApp();

async function seedBiller(name, overrides = {}) {
  return prisma.biller.create({
    data: {
      name,
      category: overrides.category || "Streaming",
      amountType: overrides.amountType || "FIXED",
      referenceLabel: "Referencia",
      payoutProvider: "manual",
      isActive: true,
      ...overrides,
    },
  });
}

async function registerAndLogin(agent, email, name = "Test User") {
  const res = await agent.post("/api/auth/register").send({ email, password: "password123", name });
  expect(res.status).toBe(201);
  return res.body.user;
}

beforeAll(async () => {
  await resetDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  await resetDb();
});

describe("paymentEngine: totalCop de pagos FIXED (regresión BLOCKER #2)", () => {
  it("computeTotal calcula comisión y total correctamente (sanity check de la fórmula)", () => {
    const { feeCop, totalCop } = computeTotal(44900);
    expect(feeCop).toBe(computeFee(44900));
    expect(totalCop).toBe(44900 + feeCop);
    expect(feeCop).toBeGreaterThan(0); // con FEE_PERCENT=10, FEE_FIXED_COP=500 fijados arriba
  });

  it("un pago FIXED termina con totalCop == amountCop + fee (nunca null) y la notificación trae el monto formateado", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "fixed-fee@example.com", "Fixed Fee");

    const cardRes = await agent.post("/api/payment-methods/simulated").send({
      number: "4111111111111111",
      expMonth: 12,
      expYear: new Date().getFullYear() + 3,
      cvc: "123",
      holderName: "Fixed Fee",
    });
    expect(cardRes.status).toBe(201);

    const netflix = await seedBiller("Netflix Fee Test", { amountType: "FIXED", category: "Streaming" });
    const dueDate = makeBogotaDate(2026, 10, 22, 0, 0, 0);

    const svcRes = await agent.post("/api/services").send({
      billerId: netflix.id,
      category: "Streaming",
      reference: "cuenta@correo.com",
      amountType: "FIXED",
      fixedAmountCop: 44900,
      frequency: "MONTHLY",
      dueDay: 22,
      anchorDate: dueDate.toISOString(),
      payDaysBefore: 2,
    });
    expect(svcRes.status).toBe(201);
    const service = svcRes.body.service;
    const user = await prisma.user.findUnique({ where: { email: "fixed-fee@example.com" } });

    // Crea directamente el Payment SCHEDULED (igual que lo haría el planificador) y lo procesa.
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        serviceId: service.id,
        paymentMethodId: service.paymentMethodId,
        periodKey: "2026-10",
        dueDate,
        scheduledFor: dueDate,
        amountCop: service.fixedAmountCop, // como hace el planificador para servicios FIXED
        idempotencyKey: `test-fixed-fee-${service.id}`,
        status: "SCHEDULED",
      },
    });

    const result = await processPayment(payment.id, dueDate);

    expect(result.status).toBe("DISBURSING");
    expect(result.amountCop).toBe(44900);
    const expectedFee = computeFee(44900);
    expect(result.feeCop).toBe(expectedFee);
    expect(result.totalCop).not.toBeNull();
    expect(result.totalCop).toBe(44900 + expectedFee);

    const notif = await prisma.notification.findFirst({
      where: { userId: user.id, type: "PAYMENT_CHARGED" },
      orderBy: { createdAt: "desc" },
    });
    expect(notif).not.toBeNull();
    // Nunca debe decir "$ 0": debe traer el total formateado en pesos colombianos.
    expect(notif.body).not.toMatch(/\$\s?0\b/);
    const expectedTotalDigits = String(44900 + expectedFee);
    expect(notif.body.replace(/\D/g, "")).toContain(expectedTotalDigits);
  });

  it("attemptCharge nunca intenta cobrar un totalCop inválido: falla el pago en vez de mandar null/NaN a la pasarela", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "invalid-total@example.com", "Invalid Total");
    const cardRes = await agent.post("/api/payment-methods/simulated").send({
      number: "4111111111111111",
      expMonth: 12,
      expYear: new Date().getFullYear() + 3,
      cvc: "123",
      holderName: "Invalid Total",
    });
    expect(cardRes.status).toBe(201);

    const biller = await seedBiller("Otro Fee Test", { amountType: "FIXED", category: "Streaming" });
    const dueDate = makeBogotaDate(2026, 10, 22, 0, 0, 0);
    const svcRes = await agent.post("/api/services").send({
      billerId: biller.id,
      category: "Streaming",
      reference: "cuenta@correo.com",
      amountType: "FIXED",
      fixedAmountCop: 10000,
      frequency: "MONTHLY",
      dueDay: 22,
      anchorDate: dueDate.toISOString(),
      payDaysBefore: 2,
    });
    const service = svcRes.body.service;
    const user = await prisma.user.findUnique({ where: { email: "invalid-total@example.com" } });

    // Simula el estado histórico defectuoso: un Payment SCHEDULED cuyo totalCop nunca se resolvió.
    const payment = await prisma.payment.create({
      data: {
        userId: user.id,
        serviceId: service.id,
        paymentMethodId: service.paymentMethodId,
        periodKey: "2026-10",
        dueDate,
        scheduledFor: dueDate,
        amountCop: 10000,
        totalCop: null,
        idempotencyKey: `test-invalid-total-${service.id}`,
        status: "SCHEDULED",
      },
    });

    const result = await attemptCharge(payment.id, dueDate);
    expect(result.status).toBe("FAILED");
    expect(result.lastError).toMatch(/inválido/i);
  });
});
