import crypto from "node:crypto";
import { config } from "../config.js";

const ALGO = "aes-256-gcm";

// Cifra un texto plano (p.ej. token de proveedor) con AES-256-GCM.
// Formato de salida: base64(iv):base64(authTag):base64(ciphertext)
export function encrypt(plainText) {
  if (plainText === null || plainText === undefined) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, config.encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function decrypt(payload) {
  if (!payload) return null;
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Payload cifrado inválido");
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv(ALGO, config.encryptionKey, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

export function sha256Hex(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function idempotencyKey(serviceId, periodKey, attempt) {
  return sha256Hex(`${serviceId}:${periodKey}:${attempt}`);
}
