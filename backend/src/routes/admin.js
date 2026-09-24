import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { requireAuth, requireAdmin } from "../lib/auth.js";
import { validateBody } from "../lib/validate.js";
import { Errors } from "../lib/errors.js";
import { config } from "../config.js";
import { runTick } from "../services/scheduler.js";
import { completePayout, failPayout } from "../services/paymentEngine.js";
import { bogotaParts, makeBogotaDate } from "../lib/dates.js";

const router = Router();
router.use(requireAuth, requireAdmin);

router.get("/overview", async (req, res, next) => {
  try {
    const now = new Date();
    const p = bogotaParts(now);
    const startOfMonth = makeBogotaDate(p.year, p.month, 1);

    const [users, activeServices, chargedThisMonth, failedCount, disbursingCount] = await Promise.all([
      prisma.user.count(),
      prisma.service.count({ where: { status: "ACTIVE" } }),
      prisma.payment.aggregate({
        where: { status: { in: ["CHARGED", "DISBURSING", "PAID"] }, chargedAt: { gte: startOfMonth } },
        _sum: { totalCop: true, feeCop: true },
      }),
      prisma.payment.count({ where: { status: "FAILED" } }),
      prisma.payment.count({ where: { status: "DISBURSING" } }),
    ]);

    res.json({
      users,
      activeServices,
      chargedThisMonthCop: chargedThisMonth._sum.totalCop || 0,
      feesThisMonthCop: chargedThisMonth._sum.feeCop || 0,
      failedCount,
      disbursingCount,
    });
  } catch (err) {
    next(err);
  }
});

router.get("/payouts", async (req, res, next) => {
  try {
    const payouts = await prisma.payment.findMany({
      where: { status: "DISBURSING" },
      include: { service: { include: { biller: true } }, user: true },
      orderBy: { chargedAt: "asc" },
    });
    res.json({ payouts });
  } catch (err) {
    next(err);
  }
});

async function loadPayment(req) {
  const id = Number(req.params.id);
  const payment = await prisma.payment.findUnique({ where: { id } });
  if (!payment) throw Errors.notFound("Pago no encontrado");
  return payment;
}

const completeSchema = z.object({ payoutRef: z.string().min(1), receiptUrl: z.string().url().optional() });

router.post("/payouts/:id/complete", validateBody(completeSchema), async (req, res, next) => {
  try {
    const payment = await loadPayment(req);
    const updated = await completePayout(payment, req.body, req.user.id);
    res.json({ payment: updated });
  } catch (err) {
    next(err);
  }
});

const failSchema = z.object({ reason: z.string().min(1) });

router.post("/payouts/:id/fail", validateBody(failSchema), async (req, res, next) => {
  try {
    const payment = await loadPayment(req);
    const updated = await failPayout(payment, req.body.reason, req.user.id);
    res.json({ payment: updated });
  } catch (err) {
    next(err);
  }
});

const runSchema = z.object({ now: z.coerce.date().optional() });

router.post("/scheduler/run", validateBody(runSchema), async (req, res, next) => {
  try {
    let now = new Date();
    if (!config.isProd && req.body && req.body.now) {
      now = new Date(req.body.now);
    }
    const result = await runTick(now);
    res.json({ result });
  } catch (err) {
    next(err);
  }
});

router.get("/users", async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        monthlyLimitCop: true,
        _count: { select: { services: true, payments: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    res.json({ users });
  } catch (err) {
    next(err);
  }
});

export default router;
