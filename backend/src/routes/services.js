import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { validateBody } from "../lib/validate.js";
import { Errors } from "../lib/errors.js";
import { audit } from "../lib/audit.js";
import { processPayment } from "../services/paymentEngine.js";
import { computeScheduledFor, periodKeyFor } from "../lib/dates.js";
import { idempotencyKey as buildIdempotencyKey } from "../lib/crypto.js";

const router = Router();
router.use(requireAuth);

const FREQUENCIES = ["WEEKLY", "MONTHLY", "BIMONTHLY", "QUARTERLY", "YEARLY"];

const createSchema = z
  .object({
    billerId: z.number().int().positive().optional().nullable(),
    customName: z.string().min(1).max(120).optional().nullable(),
    category: z.string().min(1).max(60),
    reference: z.string().min(1).max(120),
    amountType: z.enum(["FIXED", "VARIABLE"]),
    fixedAmountCop: z.number().int().positive().optional().nullable(),
    maxAmountCop: z.number().int().positive().optional().nullable(),
    frequency: z.enum(FREQUENCIES),
    dueDay: z.number().int().min(1).max(31),
    anchorDate: z.coerce.date(),
    payDaysBefore: z.number().int().min(0).max(15).default(2),
    paymentMethodId: z.number().int().positive().optional().nullable(),
  })
  .refine((d) => d.amountType !== "FIXED" || d.fixedAmountCop != null, {
    message: "fixedAmountCop es obligatorio para servicios de monto fijo",
    path: ["fixedAmountCop"],
  });

const updateSchema = z.object({
  customName: z.string().min(1).max(120).optional().nullable(),
  category: z.string().min(1).max(60).optional(),
  reference: z.string().min(1).max(120).optional(),
  fixedAmountCop: z.number().int().positive().optional().nullable(),
  maxAmountCop: z.number().int().positive().optional().nullable(),
  frequency: z.enum(FREQUENCIES).optional(),
  dueDay: z.number().int().min(1).max(31).optional(),
  payDaysBefore: z.number().int().min(0).max(15).optional(),
  paymentMethodId: z.number().int().positive().optional().nullable(),
});

function serialize(service) {
  return service;
}

router.get("/", async (req, res, next) => {
  try {
    const services = await prisma.service.findMany({
      where: { userId: req.user.id, status: { not: "DELETED" } },
      include: { biller: true, paymentMethod: true },
      orderBy: { nextDueDate: "asc" },
    });
    res.json({ services: services.map(serialize) });
  } catch (err) {
    next(err);
  }
});

router.post("/", validateBody(createSchema), async (req, res, next) => {
  try {
    const body = req.body;
    if (body.billerId) {
      const biller = await prisma.biller.findUnique({ where: { id: body.billerId } });
      if (!biller || !biller.isActive) throw Errors.badRequest("Facturador no encontrado");
    }
    if (body.paymentMethodId) {
      const pm = await prisma.paymentMethod.findFirst({
        where: { id: body.paymentMethodId, userId: req.user.id, status: "ACTIVE" },
      });
      if (!pm) throw Errors.badRequest("Tarjeta no encontrada");
    }
    const service = await prisma.service.create({
      data: {
        userId: req.user.id,
        billerId: body.billerId || null,
        customName: body.customName || null,
        category: body.category,
        reference: body.reference,
        amountType: body.amountType,
        fixedAmountCop: body.amountType === "FIXED" ? body.fixedAmountCop : null,
        maxAmountCop: body.maxAmountCop ?? null,
        frequency: body.frequency,
        dueDay: body.dueDay,
        anchorDate: body.anchorDate,
        payDaysBefore: body.payDaysBefore,
        paymentMethodId: body.paymentMethodId || null,
        status: "ACTIVE",
        nextDueDate: body.anchorDate,
      },
      include: { biller: true, paymentMethod: true },
    });
    await audit({
      userId: req.user.id,
      actorId: req.user.id,
      action: "SERVICE_CREATED",
      entity: "Service",
      entityId: service.id,
      data: { category: service.category, frequency: service.frequency },
    });
    res.status(201).json({ service: serialize(service) });
  } catch (err) {
    next(err);
  }
});

async function loadOwnedService(req) {
  const id = Number(req.params.id);
  const service = await prisma.service.findFirst({
    where: { id, userId: req.user.id, status: { not: "DELETED" } },
    include: { biller: true, paymentMethod: true },
  });
  if (!service) throw Errors.notFound("Servicio no encontrado");
  return service;
}

router.get("/:id", async (req, res, next) => {
  try {
    const service = await loadOwnedService(req);
    res.json({ service: serialize(service) });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", validateBody(updateSchema), async (req, res, next) => {
  try {
    const service = await loadOwnedService(req);
    if (req.body.paymentMethodId) {
      const pm = await prisma.paymentMethod.findFirst({
        where: { id: req.body.paymentMethodId, userId: req.user.id, status: "ACTIVE" },
      });
      if (!pm) throw Errors.badRequest("Tarjeta no encontrada");
    }
    const updated = await prisma.service.update({
      where: { id: service.id },
      data: req.body,
      include: { biller: true, paymentMethod: true },
    });
    await audit({
      userId: req.user.id,
      actorId: req.user.id,
      action: "SERVICE_UPDATED",
      entity: "Service",
      entityId: service.id,
      data: req.body,
    });
    res.json({ service: serialize(updated) });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const service = await loadOwnedService(req);
    const updated = await prisma.service.update({ where: { id: service.id }, data: { status: "DELETED" } });
    await audit({
      userId: req.user.id,
      actorId: req.user.id,
      action: "SERVICE_DELETED",
      entity: "Service",
      entityId: service.id,
      data: {},
    });
    res.json({ service: serialize(updated) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/pause", async (req, res, next) => {
  try {
    const service = await loadOwnedService(req);
    const updated = await prisma.service.update({ where: { id: service.id }, data: { status: "PAUSED" } });
    await audit({
      userId: req.user.id,
      actorId: req.user.id,
      action: "SERVICE_PAUSED",
      entity: "Service",
      entityId: service.id,
      data: {},
    });
    res.json({ service: serialize(updated) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/resume", async (req, res, next) => {
  try {
    const service = await loadOwnedService(req);
    const updated = await prisma.service.update({ where: { id: service.id }, data: { status: "ACTIVE" } });
    await audit({
      userId: req.user.id,
      actorId: req.user.id,
      action: "SERVICE_RESUMED",
      entity: "Service",
      entityId: service.id,
      data: {},
    });
    res.json({ service: serialize(updated) });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/pay-now", async (req, res, next) => {
  try {
    const service = await loadOwnedService(req);
    const now = new Date();
    const periodKey = periodKeyFor(service.nextDueDate, service.frequency);
    let payment = await prisma.payment.findUnique({
      where: { serviceId_periodKey: { serviceId: service.id, periodKey } },
    });
    if (!payment) {
      const idempotencyKey = buildIdempotencyKey(service.id, periodKey, 0);
      payment = await prisma.payment.create({
        data: {
          userId: service.userId,
          serviceId: service.id,
          paymentMethodId: service.paymentMethodId,
          periodKey,
          dueDate: service.nextDueDate,
          scheduledFor: now,
          amountCop: service.amountType === "FIXED" ? service.fixedAmountCop : null,
          idempotencyKey,
          status: "SCHEDULED",
        },
      });
    } else if (!["SCHEDULED", "PENDING_APPROVAL"].includes(payment.status)) {
      throw Errors.conflict("El pago de este periodo ya fue procesado");
    }
    const result = await processPayment(payment.id, now);
    res.json({ payment: result });
  } catch (err) {
    next(err);
  }
});

export default router;
