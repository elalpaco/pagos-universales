import { describe, it, expect } from "vitest";
import { encrypt, decrypt, idempotencyKey } from "../src/lib/crypto.js";

describe("crypto: AES-256-GCM roundtrip", () => {
  it("cifra y descifra un token correctamente", () => {
    const plain = "simtok_approve_abcdef1234567890";
    const enc = encrypt(plain);
    expect(enc).not.toBe(plain);
    expect(enc).not.toContain(plain);
    const dec = decrypt(enc);
    expect(dec).toBe(plain);
  });

  it("produce cifrados distintos cada vez (IV aleatorio)", () => {
    const plain = "same-value";
    expect(encrypt(plain)).not.toBe(encrypt(plain));
  });

  it("falla si el authTag fue alterado (integridad)", () => {
    const enc = encrypt("secreto");
    const parts = enc.split(":");
    parts[1] = Buffer.from("tampered-tag-1234").toString("base64");
    expect(() => decrypt(parts.join(":"))).toThrow();
  });
});

describe("crypto: idempotencyKey", () => {
  it("es determinística para los mismos parámetros", () => {
    expect(idempotencyKey(1, "2026-10", 0)).toBe(idempotencyKey(1, "2026-10", 0));
  });
  it("cambia si el intento cambia", () => {
    expect(idempotencyKey(1, "2026-10", 0)).not.toBe(idempotencyKey(1, "2026-10", 1));
  });
});
