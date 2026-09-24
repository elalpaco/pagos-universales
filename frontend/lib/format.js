// Formatting helpers: COP currency and America/Bogota dates, es-CO locale.

const copFormatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

export function formatCOP(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return copFormatter.format(0);
  return copFormatter.format(n);
}

// Parses a user-typed string like "44.900" or "44900" back to an integer COP.
export function parseCOPInput(str) {
  if (str === null || str === undefined) return null;
  const digits = String(str).replace(/[^\d]/g, "");
  if (!digits) return null;
  return parseInt(digits, 10);
}

// Formats an integer amount with thousands separators while typing (no currency symbol).
export function formatCOPInput(value) {
  const n = typeof value === "number" ? value : parseCOPInput(value);
  if (n === null || Number.isNaN(n)) return "";
  return new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 }).format(n);
}

const dateFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDate(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return dateFormatter.format(d);
}

export function formatDateTime(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return dateTimeFormatter.format(d);
}

export function formatRelative(value) {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diffMs = d.getTime() - Date.now();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const rtf = new Intl.RelativeTimeFormat("es-CO", { numeric: "auto" });
  if (Math.abs(diffDays) < 1) {
    const diffHours = Math.round(diffMs / (1000 * 60 * 60));
    if (Math.abs(diffHours) < 1) {
      const diffMin = Math.round(diffMs / (1000 * 60));
      return rtf.format(diffMin, "minute");
    }
    return rtf.format(diffHours, "hour");
  }
  return rtf.format(diffDays, "day");
}
