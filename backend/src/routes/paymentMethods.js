import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { validateBody } from "../lib/validate.js";
import { Errors } from "../lib/errors.js";
import { encrypt } from "../lib/crypto.js";
import { audit } from "../lib/audit.js";
import { config } from "../config.js";
import { getGateway } from "../providers/index.js";

const router = Router();
router.use(requireAuth);

function publicMethod(pm) {
  return {
    id: pm.id,
    provider: pm.provider,
    brand: pm.brand,
    last4: pm.last4,
    expMonth: pm.expMonth,
    expYear: pm.expYear,
    holderName: pm.holderName,
    isDefault: pm.isDefault,
    status: pm.status,
    createdAt: pm.createdAt,
  };
}

router.get("/", async (req, res, next) => {
  try {
    const methods = await prisma.paymentMethod.findMany({
      where: { userId: req.user.id, status: { not: "REMOVED" } },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    });
    res.json({ paymentMethods: methods.map(publicMethod) });
  } catch (err) {
    next(err);
  }
});

const wompiCreateSchema = z.object({ token: z.string().min(4) });

router.post("/", validateBody(wompiCreateSchema), async (req, res, next) => {
  try {
    if (config.paymentGateway !== "wompi") {
      throw Errors.badRequest("Esta ruta solo aplica cuando el gateway configurado es wompi");
    }
    const gateway = getGateway();
    const result = await gateway.createPaymentSource({ token: req.body.token, user: req.user });
    if (!result.ok) throw Errors.badRequest(result.error || "No se pudo registrar la tarjeta");

    const count = await prisma.paymentMethod.count({
      where: { userId: req.user.id, status: "ACTIVE" },
    });

    const pm = await prisma.paymentMethod.create({
      data: {
        userId: req.user.id,
        provider: "wompi",
        providerTokenEnc: encrypt(result.providerToken),
        brand: result.brand,
        last4: result.last4,
        expMonth: result.expMonth,
        expYear: result.expYear,
        holderName: req.user.name || "",
        isDefault: count === 0,
        status: "ACTIVE",
      },
    });
    await audit({
      userId: req.user.id,
      actorId: req.user.id,
      action: "PAYMENT_METHOD_ADDED",
      entity: "PaymentMethod",
      entityId: pm.id,
      data: { provider: "wompi", last4: pm.last4 },
    });
    res.status(201).json({ paymentMethod: publicMethod(pm) });
  } catch (err) {
    next(err);
  }
});

const simulatedSchema = z.object({
  number: z.string().min(12).max(19),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(new Date().getFullYear()),
  cvc: z.string().min(3).max(4),
  holderName: z.string().min(1).max(120),
});

router.post("/simulated", validateBody(simulatedSchema), async (req, res, next) => {
  try {
    if (config.paymentGateway !== "simulated") {
      throw Errors.badRequest("Esta ruta solo aplica en modo de gateway simulado");
    }
    const gateway = getGateway();
    const { number, expMonth, expYear, cvc, holderName } = req.body;
    // El número/CVC nunca se persisten: solo se usan en memoria para derivar el token simulado.
    const result = gateway.tokenize({ number, expMonth, expYear, cvc, holderName });
    if (!result.ok) throw Errors.badRequest(result.error);

    const count = await prisma.paymentMethod.count({
      where: { userId: req.user.id, status: "ACTIVE" },
    });

    const pm = await prisma.paymentMethod.create({
      data: {
        userId: req.user.id,
        provider: "simulated",
        providerTokenEnc: encrypt(result.providerToken),
        brand: result.brand,
        last4: result.last4,
        expMonth: result.expMonth,
        expYear: result.expYear,
        holderName: result.holderName,
        isDefault: count === 0,
        status: "ACTIVE",
      },
    });
    await audit({
      userId: req.user.id,
      actorId: req.user.id,
      action: "PAYMENT_METHOD_ADDED",
      entity: "PaymentMethod",
      entityId: pm.id,
      data: { provider: "simulated", last4: pm.last4 },
    });
    res.status(201).json({ paymentMethod: publicMethod(pm) });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/default", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pm = await prisma.paymentMethod.findFirst({ where: { id, userId: req.user.id } });
    if (!pm) throw Errors.notFound("Tarjeta no encontrada");
    await prisma.paymentMethod.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } });
    const updated = await prisma.paymentMethod.update({ where: { id }, data: { isDefault: true } });
    await audit({
      userId: req.user.id,
      actorId: req.user.id,
      action: "PAYMENT_METHOD_SET_DEFAULT",
      entity: "PaymentMethod",
      entityId: id,
      data: {},
    });
    res.json({ paymentMethod: publicMethod(updated) });
  } catch (err) {
    next(err);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const pm = await prisma.paymentMethod.findFirst({ where: { id, userId: req.user.id } });
    if (!pm) throw Errors.notFound("Tarjeta no encontrada");

    const updated = await prisma.paymentMethod.update({ where: { id }, data: { status: "REMOVED", isDefault: false } });

    const dependentServices = await prisma.service.findMany({
      where: { userId: req.user.id, paymentMethodId: id, status: "ACTIVE" },
    });
    if (dependentServices.length > 0) {
      const fallback = await prisma.paymentMethod.findFirst({
        where: { userId: req.user.id, status: "ACTIVE", isDefault: true },
      });
      await prisma.service.updateMany({
        where: { id: { in: dependentServices.map((s) => s.id) } },
        data: { paymentMethodId: fallback ? fallback.id : null },
      });
      const { notify } = await import("../lib/notify.js");
      await notify(req.user.id, {
        type: "PAYMENT_METHOD_REMOVED",
        title: "Tarjeta eliminada",
        body: fallback
          ? `${dependentServices.length} servicio(s) ahora usan tu tarjeta por defecto.`
          : `${dependentServices.length} servicio(s) se quedaron sin tarjeta asignada. Agrega una nueva.`,
      });
    }

    await audit({
      userId: req.user.id,
      actorId: req.user.id,
      action: "PAYMENT_METHOD_REMOVED",
      entity: "PaymentMethod",
      entityId: id,
      data: {},
    });
    res.json({ paymentMethod: publicMethod(updated) });
  } catch (err) {
    next(err);
  }
});

export default router;
