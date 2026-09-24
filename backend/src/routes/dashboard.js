import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { bogotaParts, makeBogotaDate } from "../lib/dates.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const userId = req.user.id;
    const now = new Date();
    const p = bogotaParts(now);
    const start = makeBogotaDate(p.year, p.month, 1);
    const end = makeBogotaDate(p.month === 12 ? p.year + 1 : p.year, p.month === 12 ? 1 : p.month + 1, 1);

    const [upcoming, pendingApproval, monthPayments, monthPaid, activeServices, failedCount, nextCharge] =
      await Promise.all([
        prisma.payment.findMany({
          where: { userId, status: "SCHEDULED" },
          orderBy: { scheduledFor: "asc" },
          take: 10,
          include: { service: true },
        }),
        prisma.payment.findMany({
          where: { userId, status: "PENDING_APPROVAL" },
          orderBy: { dueDate: "asc" },
          include: { service: true },
        }),
        prisma.payment.aggregate({
          where: { userId, dueDate: { gte: start, lt: end }, status: { notIn: ["SKIPPED"] } },
          _sum: { totalCop: true },
        }),
        prisma.payment.aggregate({
          where: { userId, status: "PAID", paidAt: { gte: start, lt: end } },
          _sum: { totalCop: true },
        }),
        prisma.service.count({ where: { userId, status: "ACTIVE" } }),
        prisma.payment.count({ where: { userId, status: "FAILED" } }),
        prisma.payment.findFirst({
          where: { userId, status: "SCHEDULED" },
          orderBy: { scheduledFor: "asc" },
        }),
      ]);

    res.json({
      upcoming,
      pendingApproval,
      monthTotalCop: monthPayments._sum.totalCop || 0,
      monthPaidCop: monthPaid._sum.totalCop || 0,
      activeServices,
      failedCount,
      nextCharge: nextCharge || null,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
