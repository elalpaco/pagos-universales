export function formatCop(amountCop) {
  try {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(amountCop);
  } catch {
    return `$${amountCop}`;
  }
}
