// Regresión BLOCKER #3: un servicio creado con anchorDate en el pasado (o reanudado tras una
// pausa larga, o replanificado por el scheduler tras estar inactivo) nunca debe generar/cobrar
// automáticamente pagos de periodos ya vencidos. nextDueDate/anchorDate deben "rodar" hacia
// adelante hasta el primer ciclo cuyo scheduledFor sea >= ahora.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import prisma from "../src/lib/prisma.js";
import { resetDb } from "./dbUtils.js";
import { makeBogotaDate } from "../src/lib/dates.js";
import { runTick } from "../src/services/scheduler.js";

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

describe("Servicios: anchorDate/nextDueDate nunca quedan en el pasado", () => {
  it("crear un servicio con anchorDate en el pasado avanza nextDueDate al primer ciclo futuro (no cobra periodos vencidos)", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "past-anchor@example.com", "Past Anchor");

    const biller = await seedBiller("Spotify Past", { amountType: "FIXED", category: "Streaming" });
    // anchorDate muy en el pasado respecto al "ahora" real del test.
    const pastAnchor = makeBogotaDate(2020, 1, 15, 0, 0, 0);

    const svcRes = await agent.post("/api/services").send({
      billerId: biller.id,
      category: "Streaming",
      reference: "user@correo.com",
      amountType: "FIXED",
      fixedAmountCop: 19900,
      frequency: "MONTHLY",
      dueDay: 15,
      anchorDate: pastAnchor.toISOString(),
      payDaysBefore: 2,
    });
    expect(svcRes.status).toBe(201);
    const service = svcRes.body.service;

    const realNow = new Date();
    expect(new Date(service.nextDueDate).getTime()).toBeGreaterThan(pastAnchor.getTime());
    // El nextDueDate resultante debe quedar en el ciclo vigente actual (no en 2020, ni saltado
    // varios ciclos hacia el futuro): a lo sumo un poco más de un mes por delante de "ahora".
    const daysAhead = (new Date(service.nextDueDate).getTime() - realNow.getTime()) / 86400000;
    expect(daysAhead).toBeGreaterThan(-32);
    expect(daysAhead).toBeLessThan(32);

    // Correr el tick "ahora" no debe crear un Payment con dueDate en 2020.
    const tickNow = new Date(realNow.getTime() + 3 * 86400000); // unos días después, por si acaso
    await runTick(tickNow);
    const payments = await prisma.payment.findMany({ where: { serviceId: service.id } });
    for (const p of payments) {
      expect(new Date(p.dueDate).getFullYear()).toBeGreaterThan(2020);
    }
  });

  it("crear un servicio sin anchorDate calcula por defecto la próxima ocurrencia de dueDay (>= hoy)", async () => {
    const agent = request.agent(app);
    await registerAndLogin(agent, "no-anchor@example.com", "No Anchor");
    const biller = await seedBiller("Disney No Anchor", { amountType: "FIXED", category: "Streaming" });

    const svcRes = await agent.post("/api/services").send({
      billerId: biller.id,
      category: "Streaming",
      reference: "user@correo.com",
      amountType: "FIXED",
      fixedAmountCop: 29900,
      frequency: "MONTHLY",
      dueDay: 10,
      payDaysBefore: 2,
      // sin anchorDate: el backend debe calcularlo.
    });
    expect(svcRes.status).toBe(201);
    const service = svcRes.body.service;
    expect(service.nextDueDate).toBeTruthy();
    expect(service.anchorDate).toBeTruthy();
    expect(new Date(service.nextDueDate).getTime()).toBeGreaterThanOrEqual(Date.now() - 86400000);
  });

  it("planServices: un servicio con nextDueDate muy vencido (pausado por meses) se replanifica hacia adelante en vez de generar un pago vencido", async () => {
    const agent = request.agent(app);
    const user = await registerAndLogin(agent, "stale-service@example.com", "Stale Service");
    const biller = await seedBiller("EPM Stale", { amountType: "FIXED", category: "Energía" });

    // Servicio creado directamente en la base (simulando uno viejo cuyo nextDueDate quedó atrás
    // porque el scheduler no corrió por mucho tiempo, o estuvo pausado).
    const staleDue = makeBogotaDate(2020, 3, 5, 0, 0, 0);
    const service = await prisma.service.create({
      data: {
        userId: user.id,
        billerId: biller.id,
        category: "Energía",
        reference: "12345",
        amountType: "FIXED",
        fixedAmountCop: 50000,
        frequency: "MONTHLY",
        dueDay: 5,
        anchorDate: staleDue,
        payDaysBefore: 2,
        status: "ACTIVE",
        nextDueDate: staleDue,
      },
    });

    const now = new Date();
    await runTick(now);

    const updated = await prisma.service.findUnique({ where: { id: service.id } });
    expect(updated.nextDueDate.getFullYear()).toBeGreaterThan(2020);

    const payments = await prisma.payment.findMany({ where: { serviceId: service.id } });
    for (const p of payments) {
      expect(p.dueDate.getFullYear()).toBeGreaterThan(2020);
    }
  });

  it("resume: un servicio pausado con nextDueDate vencido se replanifica al reanudarlo", async () => {
    const agent = request.agent(app);
    const user = await registerAndLogin(agent, "resume-service@example.com", "Resume Service");
    const biller = await seedBiller("Claro Resume", { amountType: "FIXED", category: "Telecomunicaciones" });

    const staleDue = makeBogotaDate(2021, 6, 10, 0, 0, 0);
    const service = await prisma.service.create({
      data: {
        userId: user.id,
        billerId: biller.id,
        category: "Telecomunicaciones",
        reference: "999",
        amountType: "FIXED",
        fixedAmountCop: 80000,
        frequency: "MONTHLY",
        dueDay: 10,
        anchorDate: staleDue,
        payDaysBefore: 2,
        status: "PAUSED",
        nextDueDate: staleDue,
      },
    });

    const resumeRes = await agent.post(`/api/services/${service.id}/resume`);
    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.service.status).toBe("ACTIVE");
    expect(new Date(resumeRes.body.service.nextDueDate).getFullYear()).toBeGreaterThan(2021);
  });
});
