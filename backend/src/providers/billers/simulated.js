import crypto from "node:crypto";

// Facturador simulado: monto determinístico dentro de un rango, según servicio+periodo,
// para que el flujo de "factura variable" sea reproducible en pruebas.
const RANGES = {
  Energía: [80000, 220000],
  Agua: [40000, 120000],
  Gas: [30000, 90000],
  default: [50000, 200000],
};

export const simulatedBillerProvider = {
  name: "simulated",

  async fetchBill(service, periodKey) {
    const seed = `${service.id}:${service.reference}:${periodKey}`;
    const hash = crypto.createHash("sha256").update(seed).digest();
    const n = hash.readUInt32BE(0);
    const [min, max] = RANGES[service.category] || RANGES.default;
    const amountCop = min + (n % (max - min));
    // Redondear a centena para que se vea como una factura real.
    const rounded = Math.round(amountCop / 100) * 100;
    return { amountCop: rounded, dueDate: service.nextDueDate };
  },
};

export default simulatedBillerProvider;
