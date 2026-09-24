import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { validateBody } from "../lib/validate.js";
import { Errors } from "../lib/errors.js";
import { approvePayment, skipPayment, retryPayment, setPaymentAmount } from "../services/paymentEngine.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const { status, serviceId, page = "1" } = req.query;
    const pageSize = 20;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const where = { userId: req.user.id };
    if (status) where.status = String(status);
    if (serviceId) where.serviceId = Number(serviceId);

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        include: { service: true },
        orderBy: { createdAt: "desc" },
        skip: (pageNum - 1) * pageSize,
        take: pageSize,
      }),
      prisma.payment.count({ where }),
    ]);
    res.json({ payments, total, page: pageNum, pageSize });
  } catch (err) {
    next(err);
  }
});

async function loadOwnedPayment(req) {
  const id = Number(req.params.id);
  const payment = await prisma.payment.findFirst({ where: { id, userId: req.user.id } });
  if (!payment) throw Errors.notFound("Pago no encontrado");
  return payment;
}

router.get("/:id", async (req, res, next) => {
  try {
    const payment = await loadOwnedPayment(req);
    const timeline = await prisma.auditLog.findMany({
      where: { entity: "Payment", entityId: payment.id },
      orderBy: { createdAt: "asc" },
    });
    const service = await prisma.service.findUnique({ where: { id: payment.serviceId } });
    res.json({ payment, service, timeline });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/approve", async (req, res, next) => {
  try {
    const payment = await loadOwnedPayment(req);
    if (payment.status !== "PENDING_APPROVAL") {
      throw Errors.conflict("El pago no está pendiente de aprobación");
    }
    const updated = await approvePayment(payment, new Date());
    res.json({ payment: updated });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/skip", async (req, res, next) => {
  try {
    const payment = await loadOwnedPayment(req);
    const updated = await skipPayment(payment);
    res.json({ payment: updated });
  } catch (err) {
    next(err);
  }
});

router.post("/:id/retry", async (req, res, next) => {
  try {
    const payment = await loadOwnedPayment(req);
    const updated = await retryPayment(payment, new Date());
    res.json({ payment: updated });
  } catch (err) {
    next(err);
  }
});

const amountSchema = z.object({ amountCop: z.number().int().positive() });

router.patch("/:id/amount", validateBody(amountSchema), async (req, res, next) => {
  try {
    const payment = await loadOwnedPayment(req);
    const updated = await setPaymentAmount(payment, req.body.amountCop);
    res.json({ payment: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
