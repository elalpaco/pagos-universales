import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import prisma from "./lib/prisma.js";
import { errorHandler, notFoundHandler } from "./lib/errors.js";

import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import dashboardRoutes from "./routes/dashboard.js";
import paymentMethodRoutes from "./routes/paymentMethods.js";
import billerRoutes from "./routes/billers.js";
import serviceRoutes from "./routes/services.js";
import paymentRoutes from "./routes/payments.js";
import notificationRoutes from "./routes/notifications.js";
import adminRoutes from "./routes/admin.js";
import publicConfigRoutes from "./routes/publicConfig.js";

export function createApp() {
  const app = express();

  app.set("trust proxy", 1);
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  const allowedOrigins = (process.env.CORS_ORIGINS || "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.use(
    cors({
      origin: (origin, cb) => {
        // Peticiones sin Origin (curl, health checks, same-origin) se permiten.
        if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error("Origen no permitido por CORS"));
      },
      credentials: true,
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(cookieParser());

  // Nunca loguear cuerpos de request en endpoints de tarjeta.
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/payment-methods")) {
      req._sensitive = true;
    }
    next();
  });

  const health = async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: "ok", db: "connected" });
    } catch (err) {
      res.status(500).json({ status: "error", db: "disconnected" });
    }
  };
  app.get("/health", health);
  app.get("/api/health", health);

  app.use("/api/config", publicConfigRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/me", meRoutes);
  app.use("/api/dashboard", dashboardRoutes);
  app.use("/api/payment-methods", paymentMethodRoutes);
  app.use("/api/billers", billerRoutes);
  app.use("/api/services", serviceRoutes);
  app.use("/api/payments", paymentRoutes);
  app.use("/api/notifications", notificationRoutes);
  app.use("/api/admin", adminRoutes);

  app.use("/api", notFoundHandler);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export default createApp;
