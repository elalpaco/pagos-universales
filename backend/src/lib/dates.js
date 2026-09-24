// Aritmética de fechas para el motor de programación, en zona horaria de negocio
// America/Bogota. Bogotá usa UTC-5 todo el año (sin horario de verano), así que
// podemos trabajar con un offset fijo sin depender de una librería de tz.

export const BOGOTA_OFFSET_MINUTES = -300; // UTC-5

const MONTHS_TO_ADD = {
  MONTHLY: 1,
  BIMONTHLY: 2,
  QUARTERLY: 3,
  YEARLY: 12,
};

export function daysInMonth(year, month /* 1-12 */) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// Construye el instante UTC correspondiente a una fecha/hora local de Bogotá.
export function makeBogotaDate(year, month, day, hour = 0, minute = 0, second = 0) {
  // local = UTC + offset(-5h) => UTC = local - offset = local + 5h
  const utcMs =
    Date.UTC(year, month - 1, day, hour, minute, second) - BOGOTA_OFFSET_MINUTES * 60000;
  return new Date(utcMs);
}

// Devuelve los componentes de fecha/hora de un instante, en hora de Bogotá.
export function bogotaParts(date) {
  const localMs = date.getTime() + BOGOTA_OFFSET_MINUTES * 60000;
  const d = new Date(localMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

export function addMonthsClamped(year, month, day, monthsToAdd) {
  const total = (month - 1) + monthsToAdd;
  const newYear = year + Math.floor(total / 12);
  const newMonth = (((total % 12) + 12) % 12) + 1;
  const newDay = Math.min(day, daysInMonth(newYear, newMonth));
  return { year: newYear, month: newMonth, day: newDay };
}

// Dada una fecha de vencimiento actual, calcula la siguiente según la frecuencia,
// respetando el día de vencimiento configurado (dueDay) y el fin de mes.
export function advanceDueDate(currentDueDate, dueDay, frequency) {
  const parts = bogotaParts(currentDueDate);
  if (frequency === "WEEKLY") {
    return new Date(currentDueDate.getTime() + 7 * 86400000);
  }
  const monthsToAdd = MONTHS_TO_ADD[frequency];
  if (!monthsToAdd) throw new Error(`Frecuencia desconocida: ${frequency}`);
  const { year, month, day } = addMonthsClamped(parts.year, parts.month, dueDay, monthsToAdd);
  return makeBogotaDate(year, month, day, 0, 0, 0);
}

// scheduledFor = dueDate - payDaysBefore días, a las 08:00 hora Bogotá.
export function computeScheduledFor(dueDate, payDaysBefore) {
  const parts = bogotaParts(dueDate);
  const shifted = new Date(
    makeBogotaDate(parts.year, parts.month, parts.day, 0, 0, 0).getTime() -
      payDaysBefore * 86400000
  );
  const shiftedParts = bogotaParts(shifted);
  return makeBogotaDate(shiftedParts.year, shiftedParts.month, shiftedParts.day, 8, 0, 0);
}

export function periodKeyFor(dueDate, frequency) {
  const p = bogotaParts(dueDate);
  const mm = String(p.month).padStart(2, "0");
  if (frequency === "WEEKLY") {
    const dd = String(p.day).padStart(2, "0");
    return `${p.year}-${mm}-${dd}`;
  }
  return `${p.year}-${mm}`;
}

export function addHours(date, hours) {
  return new Date(date.getTime() + hours * 3600000);
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

// Calcula la primera fecha de vencimiento (>= referenceDate, en hora de Bogotá) para un
// dueDay/frecuencia dados. Para frecuencias mensuales+ es el día dueDay (con clamping por fin
// de mes) del mes actual si aún no pasó, o el del siguiente ciclo si ya pasó. Para WEEKLY,
// advanceDueDate no usa dueDay (solo suma 7 días desde el ancla), así que el primer
// vencimiento es simplemente hoy (hora Bogotá).
export function nextOccurrenceOnOrAfter(referenceDate, dueDay, frequency) {
  const p = bogotaParts(referenceDate);
  if (frequency === "WEEKLY") {
    // advanceDueDate no usa dueDay para WEEKLY (simplemente suma 7 días desde el ancla),
    // así que el primer vencimiento por defecto es hoy mismo (hora Bogotá), a las 00:00.
    return makeBogotaDate(p.year, p.month, p.day, 0, 0, 0);
  }
  const monthsToAdd = MONTHS_TO_ADD[frequency];
  if (!monthsToAdd) throw new Error(`Frecuencia desconocida: ${frequency}`);

  // Candidato en el mes actual.
  const thisMonthDay = Math.min(dueDay, daysInMonth(p.year, p.month));
  let candidate = makeBogotaDate(p.year, p.month, thisMonthDay, 0, 0, 0);
  const refMidnight = makeBogotaDate(p.year, p.month, p.day, 0, 0, 0);
  if (candidate.getTime() < refMidnight.getTime()) {
    const { year, month, day } = addMonthsClamped(p.year, p.month, dueDay, monthsToAdd);
    candidate = makeBogotaDate(year, month, day, 0, 0, 0);
  }
  return candidate;
}

// Día de la semana (0=domingo..6=sábado) de un instante, en hora de Bogotá.
export function bogotaWeekday(date) {
  const localMs = date.getTime() + BOGOTA_OFFSET_MINUTES * 60000;
  return new Date(localMs).getUTCDay();
}

// Dado un nextDueDate de servicio (posiblemente en el pasado, p.ej. tras una pausa larga, o un
// anchorDate elegido por el usuario que ya pasó), lo hace avanzar según la frecuencia hasta que
// el SIGUIENTE ciclo después de él todavía no haya llegado (referenceDate < siguiente ciclo).
// Es decir, deja dueDate en el ciclo vigente más reciente: si el ciclo actual ya venció pero el
// siguiente todavía no, no se avanza (para no saltarse el cobro normal del día); solo se avanza
// cuando el servicio quedó varios ciclos completos atrás (p.ej. estuvo pausado meses), evitando
// así generar/cobrar automáticamente pagos de periodos históricos.
export function rollForward(dueDate, dueDay, frequency, referenceDate) {
  let d = dueDate;
  let iterations = 0;
  while (advanceDueDate(d, dueDay, frequency).getTime() <= referenceDate.getTime() && iterations < 1000) {
    d = advanceDueDate(d, dueDay, frequency);
    iterations += 1;
  }
  return d;
}
