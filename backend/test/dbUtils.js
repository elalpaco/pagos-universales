import prisma from "../src/lib/prisma.js";

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog", "Notification", "Payment", "Service", "PaymentMethod", "Biller", "User" RESTART IDENTITY CASCADE'
  );
}
