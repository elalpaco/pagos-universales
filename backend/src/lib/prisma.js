import { PrismaClient } from "@prisma/client";

// Cliente único de Prisma para toda la app (evita agotar conexiones en tests/hot-reload).
const globalForPrisma = globalThis;

export const prisma =
  globalForPrisma.__pagosPrisma ||
  new PrismaClient({
    log: process.env.PRISMA_LOG === "true" ? ["query", "warn", "error"] : ["warn", "error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__pagosPrisma = prisma;
}

export default prisma;
