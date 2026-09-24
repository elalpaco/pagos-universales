import { describe, it, expect } from "vitest";
import {
  makeBogotaDate,
  bogotaParts,
  advanceDueDate,
  computeScheduledFor,
  periodKeyFor,
  daysInMonth,
  nextOccurrenceOnOrAfter,
  rollForward,
} from "../src/lib/dates.js";

describe("dates: daysInMonth", () => {
  it("febrero no bisiesto tiene 28 días", () => {
    expect(daysInMonth(2026, 2)).toBe(28);
  });
  it("febrero bisiesto tiene 29 días", () => {
    expect(daysInMonth(2028, 2)).toBe(29);
  });
});

describe("dates: makeBogotaDate / bogotaParts roundtrip", () => {
  it("construye y lee un instante en hora de Bogotá", () => {
    const d = makeBogotaDate(2026, 10, 15, 8, 0, 0);
    const p = bogotaParts(d);
    expect(p).toMatchObject({ year: 2026, month: 10, day: 15, hour: 8, minute: 0 });
  });
});

describe("dates: advanceDueDate mensual", () => {
  it("avanza un mes respetando el día de vencimiento", () => {
    const current = makeBogotaDate(2026, 1, 31);
    const next = advanceDueDate(current, 31, "MONTHLY");
    const p = bogotaParts(next);
    // Enero (31 días) -> Febrero: no hay día 31, cae en el último día del mes.
    expect(p).toMatchObject({ year: 2026, month: 2, day: 28 });
  });

  it("dueDay 31 en un mes de 30 días cae en el día 30", () => {
    const current = makeBogotaDate(2026, 3, 31);
    const next = advanceDueDate(current, 31, "MONTHLY");
    const p = bogotaParts(next);
    expect(p).toMatchObject({ year: 2026, month: 4, day: 30 });
  });

  it("vuelve a caer en 31 cuando el mes siguiente sí lo tiene", () => {
    const current = makeBogotaDate(2026, 4, 30);
    const next = advanceDueDate(current, 31, "MONTHLY");
    const p = bogotaParts(next);
    expect(p).toMatchObject({ year: 2026, month: 5, day: 31 });
  });

  it("maneja diciembre -> enero cambiando de año", () => {
    const current = makeBogotaDate(2026, 12, 15);
    const next = advanceDueDate(current, 15, "MONTHLY");
    const p = bogotaParts(next);
    expect(p).toMatchObject({ year: 2027, month: 1, day: 15 });
  });
});

describe("dates: advanceDueDate otras frecuencias", () => {
  it("BIMONTHLY avanza 2 meses", () => {
    const current = makeBogotaDate(2026, 1, 15);
    const next = advanceDueDate(current, 15, "BIMONTHLY");
    expect(bogotaParts(next)).toMatchObject({ year: 2026, month: 3, day: 15 });
  });

  it("QUARTERLY avanza 3 meses", () => {
    const current = makeBogotaDate(2026, 1, 15);
    const next = advanceDueDate(current, 15, "QUARTERLY");
    expect(bogotaParts(next)).toMatchObject({ year: 2026, month: 4, day: 15 });
  });

  it("YEARLY avanza 12 meses y respeta 29 de febrero bisiesto", () => {
    const current = makeBogotaDate(2028, 2, 29);
    const next = advanceDueDate(current, 29, "YEARLY");
    // 2029 no es bisiesto -> cae en 28
    expect(bogotaParts(next)).toMatchObject({ year: 2029, month: 2, day: 28 });
  });

  it("WEEKLY avanza 7 días", () => {
    const current = makeBogotaDate(2026, 1, 28);
    const next = advanceDueDate(current, 0, "WEEKLY");
    expect(bogotaParts(next)).toMatchObject({ year: 2026, month: 2, day: 4 });
  });
});

describe("dates: computeScheduledFor", () => {
  it("resta payDaysBefore días y fija las 08:00 Bogotá", () => {
    const due = makeBogotaDate(2026, 10, 10);
    const scheduled = computeScheduledFor(due, 2);
    expect(bogotaParts(scheduled)).toMatchObject({ year: 2026, month: 10, day: 8, hour: 8, minute: 0 });
  });

  it("cruza el límite de mes correctamente", () => {
    const due = makeBogotaDate(2026, 3, 1);
    const scheduled = computeScheduledFor(due, 2);
    expect(bogotaParts(scheduled)).toMatchObject({ year: 2026, month: 2, day: 27, hour: 8 });
  });
});

describe("dates: periodKeyFor", () => {
  it("genera YYYY-MM para frecuencias mensuales+", () => {
    const due = makeBogotaDate(2026, 10, 5);
    expect(periodKeyFor(due, "MONTHLY")).toBe("2026-10");
  });
  it("genera YYYY-MM-DD para semanal", () => {
    const due = makeBogotaDate(2026, 10, 5);
    expect(periodKeyFor(due, "WEEKLY")).toBe("2026-10-05");
  });
});

describe("dates: nextOccurrenceOnOrAfter", () => {
  it("si el dueDay de este mes aún no pasó, lo devuelve", () => {
    const ref = makeBogotaDate(2026, 10, 5, 9, 0, 0);
    const next = nextOccurrenceOnOrAfter(ref, 22, "MONTHLY");
    expect(bogotaParts(next)).toMatchObject({ year: 2026, month: 10, day: 22 });
  });

  it("si el dueDay de este mes ya pasó, avanza al mes siguiente", () => {
    const ref = makeBogotaDate(2026, 10, 25, 9, 0, 0);
    const next = nextOccurrenceOnOrAfter(ref, 22, "MONTHLY");
    expect(bogotaParts(next)).toMatchObject({ year: 2026, month: 11, day: 22 });
  });

  it("si hoy es exactamente el dueDay, lo devuelve (no lo salta)", () => {
    const ref = makeBogotaDate(2026, 10, 22, 9, 0, 0);
    const next = nextOccurrenceOnOrAfter(ref, 22, "MONTHLY");
    expect(bogotaParts(next)).toMatchObject({ year: 2026, month: 10, day: 22 });
  });

  it("respeta el fin de mes (clamping) igual que advanceDueDate", () => {
    const ref = makeBogotaDate(2026, 2, 5, 0, 0, 0);
    const next = nextOccurrenceOnOrAfter(ref, 31, "MONTHLY");
    expect(bogotaParts(next)).toMatchObject({ year: 2026, month: 2, day: 28 });
  });

  it("WEEKLY: siempre devuelve hoy (advanceDueDate no usa dueDay para WEEKLY)", () => {
    const ref = makeBogotaDate(2026, 10, 25, 15, 0, 0);
    const next = nextOccurrenceOnOrAfter(ref, 3, "WEEKLY");
    expect(bogotaParts(next)).toMatchObject({ year: 2026, month: 10, day: 25 });
  });
});

describe("dates: rollForward", () => {
  it("no toca una fecha que ya está en el futuro", () => {
    const due = makeBogotaDate(2026, 12, 22, 0, 0, 0);
    const ref = makeBogotaDate(2026, 10, 1, 0, 0, 0);
    const rolled = rollForward(due, 22, "MONTHLY", ref);
    expect(rolled.getTime()).toBe(due.getTime());
  });

  it("NO avanza el ciclo vigente aunque ya haya pasado, si el siguiente ciclo todavía no llega " +
    "(evita el bug de saltarse el cobro normal del día por comparar contra scheduledFor)", () => {
    // Vencimiento el 22 de octubre; "ahora" es el 20 de octubre (dentro de la ventana normal
    // de cobro, scheduledFor ya pasó pero el ciclo en sí sigue vigente). No debe avanzar.
    const due = makeBogotaDate(2026, 10, 22, 0, 0, 0);
    const ref = makeBogotaDate(2026, 10, 20, 12, 0, 0);
    const rolled = rollForward(due, 22, "MONTHLY", ref);
    expect(rolled.getTime()).toBe(due.getTime());
  });

  it("avanza varios ciclos completos cuando el servicio quedó atrás (pausado meses), pero se " +
    "detiene en el ciclo vigente más reciente sin saltarse al futuro", () => {
    const due = makeBogotaDate(2026, 1, 15, 0, 0, 0);
    const ref = makeBogotaDate(2026, 6, 1, 0, 0, 0);
    const rolled = rollForward(due, 15, "MONTHLY", ref);
    // Enero..mayo ya pasaron por completo (su siguiente ciclo también ya pasó); junio todavía
    // no llega (su siguiente ciclo, julio, es posterior a la referencia) -> se detiene en mayo.
    expect(bogotaParts(rolled)).toMatchObject({ year: 2026, month: 5, day: 15 });
  });

  it("una fecha muy vieja (años atrás) se replanifica al ciclo vigente más reciente, nunca queda en el pasado lejano", () => {
    const due = makeBogotaDate(2020, 3, 5, 0, 0, 0);
    const ref = makeBogotaDate(2026, 9, 24, 0, 0, 0);
    const rolled = rollForward(due, 5, "MONTHLY", ref);
    expect(bogotaParts(rolled).year).toBeGreaterThanOrEqual(2026);
  });
});
