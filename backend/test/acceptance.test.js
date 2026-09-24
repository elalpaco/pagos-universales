import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import prisma from "../src/lib/prisma.js";
import { resetDb } from "./dbUtils.js";
import { makeBogotaDate } from "../src/lib/dates.js";

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

describe("Flujo completo de aceptación (DISENO.md §11.2,3,5)", () => {
  it("registra, agrega tarjeta, crea servicios, corre el tick y llega hasta PAID sin doble cobro", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "diego-flow@example.com", "Diego Flow");

    // Agregar tarjeta de prueba que aprueba.
    const cardRes = await agent.post("/api/payment-methods/simulated").send({
      number: "4111111111111111",
      expMonth: 12,
      expYear: new Date().getFullYear() + 3,
      cvc: "123",
      holderName: "Diego Flow",
    });
    expect(cardRes.status).toBe(201);
    expect(cardRes.body.paymentMethod.last4).toBe("1111");

    const netflix = await seedBiller("Netflix Test", { amountType: "FIXED", category: "Streaming" });
    const epm = await seedBiller("EPM Energía Test", { amountType: "VARIABLE", category: "Energía" });

    const now = makeBogotaDate(2026, 10, 20, 12, 0, 0);
    const dueDate = makeBogotaDate(2026, 10, 22, 0, 0, 0); // dentro de payDaysBefore

    // Servicio fijo: Netflix 44.900 mensual.
    const fixedRes = await agent.post("/api/services").send({
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
    expect(fixedRes.status).toBe(201);
    const fixedService = fixedRes.body.service;

    // Servicio variable: EPM con tope menor al monto simulado (rango 80000-220000).
    const variableRes = await agent.post("/api/services").send({
      billerId: epm.id,
      category: "Energía",
      reference: "12345",
      amountType: "VARIABLE",
      maxAmountCop: 1000, // el monto simulado siempre será mayor -> requiere aprobación
      frequency: "MONTHLY",
      dueDay: 22,
      anchorDate: dueDate.toISOString(),
      payDaysBefore: 2,
    });
    expect(variableRes.status).toBe(201);
    const variableService = variableRes.body.service;

    // Correr el tick con la fecha simulada.
    const tick1 = await agent.post("/api/admin/scheduler/run").send({});
    // No es admin todavía -> debe fallar 403. Usamos el usuario admin sembrado aparte más abajo.
    expect(tick1.status).toBe(403);

    // Promover manualmente a admin para poder correr el scheduler (en un flujo real sería otro usuario).
    await prisma.user.update({ where: { email: "diego-flow@example.com" }, data: { role: "ADMIN" } });
    // Nueva sesión para que el JWT lleve el rol actualizado.
    const adminAgent = request.agent(app);
    const loginRes = await adminAgent
      .post("/api/auth/login")
      .send({ email: "diego-flow@example.com", password: "password123" });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.role).toBe("ADMIN");

    const run1 = await adminAgent.post("/api/admin/scheduler/run").send({ now: now.toISOString() });
    expect(run1.status).toBe(200);

    // Pago fijo: debe haber quedado cobrado y en desembolso.
    const fixedPayment = await prisma.payment.findFirst({ where: { serviceId: fixedService.id } });
    expect(fixedPayment).not.toBeNull();
    expect(fixedPayment.status).toBe("DISBURSING");
    expect(fixedPayment.amountCop).toBe(44900);

    // Pago variable: supera el tope -> pendiente de aprobación.
    const variablePayment = await prisma.payment.findFirst({ where: { serviceId: variableService.id } });
    expect(variablePayment).not.toBeNull();
    expect(variablePayment.status).toBe("PENDING_APPROVAL");
    expect(variablePayment.amountCop).toBeGreaterThan(1000);

    // Notificaciones creadas.
    const notifCount = await prisma.notification.count({ where: { userId: fixedPayment.userId } });
    expect(notifCount).toBeGreaterThan(0);

    // Aprobar el pago variable (usa la misma sesión de usuario, dueño del recurso).
    const approveRes = await adminAgent.post(`/api/payments/${variablePayment.id}/approve`).send({});
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.payment.status).toBe("DISBURSING");

    // Admin completa el desembolso de ambos pagos.
    const completeFixed = await adminAgent
      .post(`/api/admin/payouts/${fixedPayment.id}/complete`)
      .send({ payoutRef: "REF-FIXED-1", receiptUrl: "https://example.com/receipt1.pdf" });
    expect(completeFixed.status).toBe(200);
    expect(completeFixed.body.payment.status).toBe("PAID");

    const completeVariable = await adminAgent
      .post(`/api/admin/payouts/${variablePayment.id}/complete`)
      .send({ payoutRef: "REF-VAR-1" });
    expect(completeVariable.status).toBe(200);
    expect(completeVariable.body.payment.status).toBe("PAID");

    // Correr el tick una segunda vez con la misma fecha: no debe cobrar dos veces el mismo periodo
    // (aunque sí puede planificar el pago del periodo siguiente, eso es esperado).
    const run2 = await adminAgent.post("/api/admin/scheduler/run").send({ now: now.toISOString() });
    expect(run2.status).toBe(200);

    const fixedPaymentsSamePeriod = await prisma.payment.findMany({
      where: { serviceId: fixedService.id, periodKey: fixedPayment.periodKey },
    });
    expect(fixedPaymentsSamePeriod).toHaveLength(1);
    expect(fixedPaymentsSamePeriod[0].status).toBe("PAID"); // no cambió, no se recobró
    expect(fixedPaymentsSamePeriod[0].gatewayRef).toBe(fixedPayment.gatewayRef);

    const variablePaymentsSamePeriod = await prisma.payment.findMany({
      where: { serviceId: variableService.id, periodKey: variablePayment.periodKey },
    });
    expect(variablePaymentsSamePeriod).toHaveLength(1);
    expect(variablePaymentsSamePeriod[0].status).toBe("PAID");

    // Muchos ticks seguidos (el cron corre cada 5 min) no deben planificar meses adelante:
    // a lo sumo un pago SCHEDULED por servicio.
    for (let i = 0; i < 10; i++) {
      await adminAgent.post("/api/admin/scheduler/run").send({ now: now.toISOString() });
    }
    const totalFixed = await prisma.payment.count({ where: { serviceId: fixedService.id } });
    expect(totalFixed).toBe(2);
    const scheduledFixed = await prisma.payment.count({
      where: { serviceId: fixedService.id, status: "SCHEDULED" },
    });
    expect(scheduledFixed).toBe(1);
  });

  it("tarjeta que declina agota reintentos y termina en FAILED con notificación", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "declina@example.com", "Declina Test");

    const cardRes = await agent.post("/api/payment-methods/simulated").send({
      number: "4000000000000002",
      expMonth: 12,
      expYear: new Date().getFullYear() + 3,
      cvc: "123",
      holderName: "Declina Test",
    });
    expect(cardRes.status).toBe(201);

    const biller = await seedBiller("Spotify Test", { amountType: "FIXED", category: "Streaming" });
    const dueDate = makeBogotaDate(2026, 10, 22, 0, 0, 0);
    const svcRes = await agent.post("/api/services").send({
      billerId: biller.id,
      category: "Streaming",
      reference: "user@correo.com",
      amountType: "FIXED",
      fixedAmountCop: 19900,
      frequency: "MONTHLY",
      dueDay: 22,
      anchorDate: dueDate.toISOString(),
      payDaysBefore: 2,
    });
    expect(svcRes.status).toBe(201);

    await prisma.user.update({ where: { email: "declina@example.com" }, data: { role: "ADMIN" } });
    const adminAgent = request.agent(app);
    await adminAgent.post("/api/auth/login").send({ email: "declina@example.com", password: "password123" });

    const now1 = makeBogotaDate(2026, 10, 20, 12, 0, 0);
    await adminAgent.post("/api/admin/scheduler/run").send({ now: now1.toISOString() });

    let payment = await prisma.payment.findFirst({ where: { serviceId: svcRes.body.service.id } });
    expect(payment.status).toBe("SCHEDULED");
    expect(payment.attempts).toBe(1);
    expect(payment.nextAttemptAt).not.toBeNull();

    const now2 = new Date(payment.nextAttemptAt.getTime() + 60000);
    await adminAgent.post("/api/admin/scheduler/run").send({ now: now2.toISOString() });
    payment = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(payment.attempts).toBe(2);
    expect(payment.status).toBe("SCHEDULED");

    const now3 = new Date(payment.nextAttemptAt.getTime() + 60000);
    await adminAgent.post("/api/admin/scheduler/run").send({ now: now3.toISOString() });
    payment = await prisma.payment.findUnique({ where: { id: payment.id } });
    expect(payment.attempts).toBe(3);
    expect(payment.status).toBe("FAILED");

    const failedNotif = await prisma.notification.findFirst({
      where: { userId: payment.userId, type: "PAYMENT_FAILED" },
    });
    expect(failedNotif).not.toBeNull();
  });

  it("aísla datos entre usuarios: el usuario B no puede ver ni modificar recursos del usuario A", async () => {
    const agentA = request.agent(app);
    const userA = await registerAndLogin(agentA, "userA@example.com", "Usuario A");
    const agentB = request.agent(app);
    await registerAndLogin(agentB, "userB@example.com", "Usuario B");

    const biller = await seedBiller("Disney+ Test", { amountType: "FIXED", category: "Streaming" });
    const dueDate = makeBogotaDate(2026, 11, 5, 0, 0, 0);
    const svcRes = await agentA.post("/api/services").send({
      billerId: biller.id,
      category: "Streaming",
      reference: "a@correo.com",
      amountType: "FIXED",
      fixedAmountCop: 29900,
      frequency: "MONTHLY",
      dueDay: 5,
      anchorDate: dueDate.toISOString(),
      payDaysBefore: 2,
    });
    expect(svcRes.status).toBe(201);
    const serviceId = svcRes.body.service.id;

    // B no puede ver el servicio de A.
    const getAsB = await agentB.get(`/api/services/${serviceId}`);
    expect(getAsB.status).toBe(404);

    // B no puede modificarlo.
    const patchAsB = await agentB.patch(`/api/services/${serviceId}`).send({ dueDay: 10 });
    expect(patchAsB.status).toBe(404);

    // B no puede pausarlo.
    const pauseAsB = await agentB.post(`/api/services/${serviceId}/pause`).send({});
    expect(pauseAsB.status).toBe(404);

    // A sí puede.
    const getAsA = await agentA.get(`/api/services/${serviceId}`);
    expect(getAsA.status).toBe(200);
  });

  it("nunca persiste el PAN completo en la base de datos", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "pan-check@example.com", "Pan Check");
    const number = "4111111111111111";
    const res = await agent.post("/api/payment-methods/simulated").send({
      number,
      expMonth: 12,
      expYear: new Date().getFullYear() + 3,
      cvc: "123",
      holderName: "Pan Check",
    });
    expect(res.status).toBe(201);

    const allMethods = await prisma.paymentMethod.findMany();
    for (const m of allMethods) {
      expect(m.providerTokenEnc).not.toContain(number);
      expect(JSON.stringify(m)).not.toContain(number);
    }
  });
});
