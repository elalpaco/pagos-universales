import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

const CONTRATO = "Número de contrato";
const CUENTA = "Correo o usuario de la cuenta";

const BILLERS = [
  { name: "EPM Energía", category: "Energía", logoEmoji: "⚡", amountType: "VARIABLE", referenceLabel: CONTRATO },
  { name: "EPM Agua", category: "Agua", logoEmoji: "💧", amountType: "VARIABLE", referenceLabel: CONTRATO },
  { name: "EPM Gas", category: "Gas", logoEmoji: "🔥", amountType: "VARIABLE", referenceLabel: CONTRATO },
  { name: "Enel-Codensa", category: "Energía", logoEmoji: "⚡", amountType: "VARIABLE", referenceLabel: CONTRATO },
  { name: "Vanti", category: "Gas", logoEmoji: "🔥", amountType: "VARIABLE", referenceLabel: CONTRATO },
  { name: "Acueducto Bogotá", category: "Agua", logoEmoji: "💧", amountType: "VARIABLE", referenceLabel: CONTRATO },
  { name: "Claro", category: "Telecomunicaciones", logoEmoji: "📶", amountType: "VARIABLE", referenceLabel: CONTRATO },
  { name: "Movistar", category: "Telecomunicaciones", logoEmoji: "📶", amountType: "VARIABLE", referenceLabel: CONTRATO },
  { name: "Tigo", category: "Telecomunicaciones", logoEmoji: "📶", amountType: "VARIABLE", referenceLabel: CONTRATO },
  { name: "ETB", category: "Telecomunicaciones", logoEmoji: "📶", amountType: "VARIABLE", referenceLabel: CONTRATO },
  { name: "DirecTV", category: "Televisión", logoEmoji: "📺", amountType: "FIXED", referenceLabel: CONTRATO },
  { name: "Netflix", category: "Streaming", logoEmoji: "🎬", amountType: "FIXED", referenceLabel: CUENTA },
  { name: "Spotify", category: "Streaming", logoEmoji: "🎵", amountType: "FIXED", referenceLabel: CUENTA },
  { name: "Disney+", category: "Streaming", logoEmoji: "🏰", amountType: "FIXED", referenceLabel: CUENTA },
  { name: "YouTube Premium", category: "Streaming", logoEmoji: "▶️", amountType: "FIXED", referenceLabel: CUENTA },
  { name: "Amazon Prime", category: "Streaming", logoEmoji: "📦", amountType: "FIXED", referenceLabel: CUENTA },
  { name: "Apple iCloud", category: "Almacenamiento", logoEmoji: "☁️", amountType: "FIXED", referenceLabel: CUENTA },
  { name: "Google One", category: "Almacenamiento", logoEmoji: "☁️", amountType: "FIXED", referenceLabel: CUENTA },
  { name: "Microsoft 365", category: "Software", logoEmoji: "💻", amountType: "FIXED", referenceLabel: CUENTA },
  { name: "ChatGPT/Claude", category: "Software", logoEmoji: "🤖", amountType: "FIXED", referenceLabel: CUENTA },
  { name: "Smart Fit", category: "Gimnasio", logoEmoji: "🏋️", amountType: "FIXED", referenceLabel: CONTRATO },
  { name: "Bodytech", category: "Gimnasio", logoEmoji: "🏋️", amountType: "FIXED", referenceLabel: CONTRATO },
  { name: "Administración conjunto", category: "Vivienda", logoEmoji: "🏢", amountType: "VARIABLE", referenceLabel: CONTRATO },
  { name: "Seguro vehículo", category: "Seguros", logoEmoji: "🚗", amountType: "FIXED", referenceLabel: "Número de póliza" },
  { name: "Colsanitas/prepagada", category: "Salud", logoEmoji: "🩺", amountType: "FIXED", referenceLabel: CONTRATO },
  { name: "Crédito hipotecario", category: "Crédito", logoEmoji: "🏠", amountType: "FIXED", referenceLabel: "Número de obligación" },
  { name: "Impuesto predial", category: "Impuestos", logoEmoji: "🧾", amountType: "VARIABLE", referenceLabel: "Número de predial" },
  { name: "Otro", category: "Otro", logoEmoji: "🧩", amountType: "VARIABLE", referenceLabel: CONTRATO },
];

async function seedBillers() {
  for (const biller of BILLERS) {
    await prisma.biller.upsert({
      where: { name: biller.name },
      update: { ...biller, isActive: true },
      create: { ...biller, payoutProvider: "manual", isActive: true },
    });
  }
  console.log(`Billers sembrados: ${BILLERS.length}`);
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || "diego@pelletier.com.co";
  const name = process.env.ADMIN_NAME || "Diego";
  let password = process.env.ADMIN_PASSWORD;

  if (!password) {
    if (isProd) {
      throw new Error(
        "ADMIN_PASSWORD es obligatorio en producción para sembrar el usuario administrador."
      );
    }
    password = "CambiaEsta123!";
    console.warn(
      `[seed] ADMIN_PASSWORD no fue definido. Usando contraseña por defecto insegura "${password}" — ` +
        "cámbiala antes de exponer este entorno."
    );
  }

  const passwordHash = await bcrypt.hash(password, 10);
  // Por defecto, re-sembrar no toca la contraseña de un admin ya existente (para no pisar un
  // cambio de contraseña hecho desde la app). Con ADMIN_RESET_PASSWORD=true sí se actualiza el
  // hash en cada `npm run seed`, útil para resetear el acceso en desarrollo/staging.
  const resetPassword = (process.env.ADMIN_RESET_PASSWORD || "false").toLowerCase() === "true";
  const existing = await prisma.user.findUnique({ where: { email } });
  const updateData = { name, role: "ADMIN" };
  if (resetPassword || !existing) {
    updateData.passwordHash = passwordHash;
  }
  const user = await prisma.user.upsert({
    where: { email },
    update: updateData,
    create: { email, name, passwordHash, role: "ADMIN" },
  });
  console.log(
    `Usuario admin listo: ${user.email} (id ${user.id})${
      existing && resetPassword ? " — contraseña actualizada (ADMIN_RESET_PASSWORD=true)" : ""
    }`
  );
}

async function main() {
  await seedBillers();
  await seedAdmin();
}

main()
  .catch((err) => {
    console.error("Error sembrando datos:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
