import crypto from "node:crypto";
import { config } from "../../config.js";

async function wompiFetch(path, options = {}) {
  const res = await fetch(`${config.wompi.apiUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, body: json };
}

function integritySignature({ reference, amountInCents, currency }) {
  const raw = `${reference}${amountInCents}${currency}${config.wompi.integritySecret}`;
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function getAcceptanceToken() {
  const { body } = await wompiFetch(`/merchants/${config.wompi.publicKey}`);
  return body?.data?.presigned_acceptance?.acceptance_token;
}

export const wompiGateway = {
  name: "wompi",

  // El frontend tokeniza directo contra Wompi; el backend solo recibe el token público.
  async createPaymentSource({ token, user }) {
    const acceptanceToken = await getAcceptanceToken();
    if (!acceptanceToken) {
      return { ok: false, error: "No se pudo obtener acceptance_token de Wompi" };
    }
    const { ok, body } = await wompiFetch("/payment_sources", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.wompi.privateKey}` },
      body: JSON.stringify({
        type: "CARD",
        token,
        customer_email: user.email,
        acceptance_token: acceptanceToken,
      }),
    });
    if (!ok || !body?.data?.id) {
      return { ok: false, error: body?.error?.reason || "No se pudo crear el método de pago en Wompi" };
    }
    const data = body.data;
    const extra = data.public_data || {};
    return {
      ok: true,
      providerToken: String(data.id),
      brand: extra.card_brand || extra.brand || "CARD",
      last4: extra.last_four || "0000",
      expMonth: extra.exp_month ? Number(extra.exp_month) : 0,
      expYear: extra.exp_year ? Number(extra.exp_year) : 0,
    };
  },

  async charge({ providerToken, amountCop, reference, idempotencyKey, user }) {
    const amountInCents = amountCop * 100;
    const signature = integritySignature({ reference, amountInCents, currency: "COP" });
    const { ok, body } = await wompiFetch("/transactions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.wompi.privateKey}`,
        "Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        amount_in_cents: amountInCents,
        currency: "COP",
        customer_email: user.email,
        payment_source_id: Number(providerToken),
        reference,
        signature,
        recurrent: true,
      }),
    });
    if (!ok || !body?.data?.id) {
      return { ok: false, error: body?.error?.reason || "Error creando transacción en Wompi" };
    }
    let transaction = body.data;
    const transactionId = transaction.id;
    // Poll corto hasta estado final.
    for (let i = 0; i < 6 && transaction.status === "PENDING"; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      const poll = await wompiFetch(`/transactions/${transactionId}`, {
        headers: { Authorization: `Bearer ${config.wompi.privateKey}` },
      });
      if (poll.ok) transaction = poll.body.data;
    }
    if (transaction.status === "APPROVED") {
      return { ok: true, gatewayRef: String(transaction.id) };
    }
    return {
      ok: false,
      gatewayRef: String(transaction.id),
      error: transaction.status_message || `Transacción ${transaction.status}`,
    };
  },

  async refund({ gatewayRef, amountCop }) {
    const { ok, body } = await wompiFetch("/transactions/void", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.wompi.privateKey}` },
      body: JSON.stringify({ id: gatewayRef, amount_in_cents: amountCop ? amountCop * 100 : undefined }),
    });
    return { ok: ok && !body?.error };
  },
};

export default wompiGateway;
