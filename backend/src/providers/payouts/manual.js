// Payout manual (modelo "concierge"): el pago simplemente entra a la cola de operaciones
// (Payment.status = DISBURSING); un operador humano paga al facturador y registra el comprobante
// vía POST /api/admin/payouts/:id/complete.
export const manualPayoutProvider = {
  name: "manual",

  async enqueue(payment) {
    return { ok: true, queued: true, paymentId: payment.id };
  },
};

export default manualPayoutProvider;
