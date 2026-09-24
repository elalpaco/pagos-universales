import crypto from "node:crypto";

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";

function req(name, devDefault) {
  const v = process.env[name];
  if (v && v.length > 0) return v;
  if (isProd) {
    throw new Error(`Falta variable de entorno obligatoria en producción: ${name}`);
  }
  return devDefault;
}

// JWT_SECRET / ENCRYPTION_KEY: obligatorias en producción.
const JWT_SECRET = req("JWT_SECRET", "dev-jwt-secret-not-for-production-0000000000");
// ENCRYPTION_KEY debe ser de 32 bytes para AES-256-GCM. Aceptamos hex/base64/string y derivamos con sha256.
const ENCRYPTION_KEY_RAW = req("ENCRYPTION_KEY", "dev-encryption-key-not-for-production");
const ENCRYPTION_KEY = crypto.createHash("sha256").update(ENCRYPTION_KEY_RAW).digest();

export const config = {
  nodeEnv: NODE_ENV,
  isProd,
  port: parseInt(process.env.PORT || "4000", 10),
  tz: process.env.TZ_NAME || process.env.TZ || "America/Bogota",
  jwtSecret: JWT_SECRET,
  jwtExpiresIn: "7d",
  encryptionKey: ENCRYPTION_KEY,
  allowSignup: (process.env.ALLOW_SIGNUP ?? "true") !== "false",
  paymentGateway: process.env.PAYMENT_GATEWAY || "simulated",
  wompi: {
    env: process.env.WOMPI_ENV || "sandbox",
    publicKey: process.env.WOMPI_PUBLIC_KEY || "",
    privateKey: process.env.WOMPI_PRIVATE_KEY || "",
    integritySecret: process.env.WOMPI_INTEGRITY_SECRET || "",
    apiUrl:
      process.env.WOMPI_API_URL ||
      (process.env.WOMPI_ENV === "production"
        ? "https://production.wompi.co/v1"
        : "https://sandbox.wompi.co/v1"),
  },
  feePercent: parseFloat(process.env.FEE_PERCENT || "0"),
  feeFixedCop: parseInt(process.env.FEE_FIXED_COP || "0", 10),
  scheduler: {
    enabled: (process.env.SCHEDULER_ENABLED ?? "true") !== "false",
    cron: process.env.SCHEDULER_CRON || "*/5 * * * *",
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.SMTP_FROM || "PAGOS-UNIVERSALES <no-reply@pagos-universales.local>",
  },
  admin: {
    email: process.env.ADMIN_EMAIL || "diego@pelletier.com.co",
    password: process.env.ADMIN_PASSWORD || (isProd ? "" : "CambiaEsta123!"),
    name: process.env.ADMIN_NAME || "Diego",
  },
};

export default config;
