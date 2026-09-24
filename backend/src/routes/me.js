import { Router } from "express";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { requireAuth } from "../lib/auth.js";
import { validateBody } from "../lib/validate.js";

const router = Router();
router.use(requireAuth);

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    phone: user.phone,
    notifyEmail: user.notifyEmail,
    monthlyLimitCop: user.monthlyLimitCop,
  };
}

router.get("/", (req, res) => {
  res.json({ user: publicUser(req.user) });
});

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(30).nullable().optional(),
  notifyEmail: z.boolean().optional(),
  monthlyLimitCop: z.number().int().positive().nullable().optional(),
});

router.patch("/", validateBody(patchSchema), async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user.id },
      data: req.body,
    });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

export default router;
