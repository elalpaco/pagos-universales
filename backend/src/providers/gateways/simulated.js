import crypto from "node:crypto";

// Gateway simulado: no requiere llaves externas. Reglas de prueba (ver DISENO.md §6):
//  - 4111111111111111 -> aprueba
//  - 4000000000000002 -> declina
//  - 4000000000009995 -> fondos insuficientes
//  - cualquier otra con Luhn válido -> aprueba
export function luhnValid(numberStr) {
  const digits = String(numberStr).replace(/\D/g, "");
  if (digits.length < 12) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = parseInt(digits[i], 10);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

function brandFromNumber(number) {
  if (/^4/.test(number)) return "VISA";
  if (/^5[1-5]/.test(number)) return "MASTERCARD";
  if (/^3[47]/.test(number)) return "AMEX";
  return "CARD";
}

function behaviorFor(number) {
  if (number === "4111111111111111") return "approve";
  if (number === "4000000000000002") return "decline";
  if (number === "4000000000009995") return "insufficient_funds";
  if (luhnValid(number)) return "approve";
  return "invalid";
}

export const simulatedGateway = {
  name: "simulated",

  // Solo disponible en modo simulado: recibe el número de tarjeta directamente (nunca se persiste).
  tokenize({ number, expMonth, expYear, cvc, holderName }) {
    const digits = String(number).replace(/\D/g, "");
    const behavior = behaviorFor(digits);
    if (behavior === "invalid") {
      return { ok: false, error: "Número de tarjeta inválido" };
    }
    const last4 = digits.slice(-4);
    const brand = brandFromNumber(digits);
    const providerToken = `simtok_${behavior}_${crypto.randomBytes(8).toString("hex")}`;
    return {
      ok: true,
      providerToken,
      brand,
      last4,
      expMonth,
      expYear,
      holderName,
    };
  },

  // Interfaz común: crea un payment source a partir de un token ya emitido (no usado en modo
  // simulado directo desde frontend, pero se mantiene por paridad de interfaz).
  async createPaymentSource({ token }) {
    return { ok: true, providerToken: token };
  },

  async charge({ providerToken, amountCop, reference, idempotencyKey }) {
    const parts = String(providerToken).split("_");
    const behavior = parts[1] || "approve";
    if (behavior === "decline") {
      return { ok: false, error: "La tarjeta fue declinada por el emisor" };
    }
    if (behavior === "insufficient_funds") {
      return { ok: false, error: "Fondos insuficientes" };
    }
    const gatewayRef = `simcharge_${idempotencyKey.slice(0, 16)}`;
    return { ok: true, gatewayRef, amountCop, reference };
  },

  async refund({ gatewayRef }) {
    if (!gatewayRef) return { ok: false, error: "Sin referencia de cobro" };
    return { ok: true };
  },
};

export default simulatedGateway;
