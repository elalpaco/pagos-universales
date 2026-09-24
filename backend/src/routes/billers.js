import { Router } from "express";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const { q, category } = req.query;
    const where = { isActive: true };
    if (category) where.category = String(category);
    if (q) where.name = { contains: String(q), mode: "insensitive" };
    const billers = await prisma.biller.findMany({ where, orderBy: { name: "asc" } });
    res.json({ billers });
  } catch (err) {
    next(err);
  }
});

export default router;
