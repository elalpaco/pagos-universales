import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import prisma from "../lib/prisma.js";
import { config } from "../config.js";
import { hashPassword, verifyPassword, signToken, setAuthCookie, clearAuthCookie } from "../lib/auth.js";
import { validateBody } from "../lib/validate.js";
import { Errors } from "../lib/errors.js";
import { audit } from "../lib/audit.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

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

router.post("/register", authLimiter, validateBody(registerSchema), async (req, res, next) => {
  try {
    if (!config.allowSignup) {
      throw Errors.forbidden("El registro está deshabilitado");
    }
    const { email, password, name } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) throw Errors.conflict("Ya existe una cuenta con ese correo");

    const passwordHash = await hashPassword(password);
    const user = await prisma.user.create({
      data: { email, name, passwordHash },
    });
    await audit({ userId: user.id, actorId: user.id, action: "USER_REGISTERED", entity: "User", entityId: user.id, data: {} });

    const token = signToken(user);
    setAuthCookie(res, token);
    res.status(201).json({ user: publicUser(user), token });
  } catch (err) {
    next(err);
  }
});

router.post("/login", authLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw Errors.unauthorized("Credenciales inválidas");
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw Errors.unauthorized("Credenciales inválidas");

    const token = signToken(user);
    setAuthCookie(res, token);
    await audit({ userId: user.id, actorId: user.id, action: "USER_LOGIN", entity: "User", entityId: user.id, data: {} });
    res.json({ user: publicUser(user), token });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", (req, res) => {
  clearAuthCookie(res);
  res.json({ ok: true });
});

export default router;
