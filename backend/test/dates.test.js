import { describe, it, expect } from "vitest";
import {
  makeBogotaDate,
  bogotaParts,
  advanceDueDate,
  computeScheduledFor,
  periodKeyFor,
  daysInMonth,
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
