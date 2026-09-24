// Aritmética de fechas en hora de Bogotá (UTC-5 fijo, sin horario de verano), espejo mínimo
// de backend/src/lib/dates.js — solo lo necesario para calcular/editar el primer vencimiento
// ("anchorDate") en el asistente de servicios, de forma consistente con el backend.

const BOGOTA_OFFSET_MINUTES = -300; // UTC-5

export function daysInMonth(year, month /* 1-12 */) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function makeBogotaDate(year, month, day, hour = 0, minute = 0, second = 0) {
  const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - BOGOTA_OFFSET_MINUTES * 60000;
  return new Date(utcMs);
}

export function bogotaParts(date) {
  const localMs = date.getTime() + BOGOTA_OFFSET_MINUTES * 60000;
  const d = new Date(localMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
  };
}

function addMonthsClamped(year, month, day, monthsToAdd) {
  const total = month - 1 + monthsToAdd;
  const newYear = year + Math.floor(total / 12);
  const newMonth = (((total % 12) + 12) % 12) + 1;
  const newDay = Math.min(day, daysInMonth(newYear, newMonth));
  return { year: newYear, month: newMonth, day: newDay };
}

const MONTHS_TO_ADD = { MONTHLY: 1, BIMONTHLY: 2, QUARTERLY: 3, YEARLY: 12 };

// Calcula el primer vencimiento (>= hoy, hora Bogotá) para un dueDay/frecuencia dados.
// Misma lógica que backend/src/lib/dates.js#nextOccurrenceOnOrAfter: para WEEKLY (que en el
// backend no usa dueDay, solo suma 7 días desde el ancla) el primer vencimiento es hoy mismo.
export function nextOccurrenceOnOrAfter(referenceDate, dueDay, frequency) {
  const p = bogotaParts(referenceDate);
  if (frequency === "WEEKLY") {
    return makeBogotaDate(p.year, p.month, p.day);
  }
  const monthsToAdd = MONTHS_TO_ADD[frequency] || 1;
  const thisMonthDay = Math.min(dueDay, daysInMonth(p.year, p.month));
  let candidate = makeBogotaDate(p.year, p.month, thisMonthDay);
  const refMidnight = makeBogotaDate(p.year, p.month, p.day);
  if (candidate.getTime() < refMidnight.getTime()) {
    const { year, month, day } = addMonthsClamped(p.year, p.month, dueDay, monthsToAdd);
    candidate = makeBogotaDate(year, month, day);
  }
  return candidate;
}

// Formatea una fecha como "YYYY-MM-DD" en hora de Bogotá, para <input type="date">.
export function toDateInputValue(date) {
  const p = bogotaParts(date);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

// Parsea el valor de un <input type="date"> ("YYYY-MM-DD") como medianoche en Bogotá.
export function fromDateInputValue(value) {
  const [y, m, d] = String(value).split("-").map((n) => parseInt(n, 10));
  if (!y || !m || !d) return null;
  return makeBogotaDate(y, m, d);
}
