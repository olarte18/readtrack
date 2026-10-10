import { addDays, diffDays, formatDateEs, todayString, nowIso, APP_TZ } from "../dates";

describe("addDays", () => {
  it("suma y resta días dentro del mes", () => {
    expect(addDays("2026-10-10", 1)).toBe("2026-10-11");
    expect(addDays("2026-10-10", -1)).toBe("2026-10-09");
  });

  it("cruza fin de año", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("respeta años bisiestos", () => {
    expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("diffDays", () => {
  it("devuelve la diferencia en días con signo", () => {
    expect(diffDays("2026-10-10", "2026-10-11")).toBe(1);
    expect(diffDays("2026-10-11", "2026-10-10")).toBe(-1);
    expect(diffDays("2026-10-10", "2026-10-10")).toBe(0);
  });

  it("cuenta el año completo", () => {
    expect(diffDays("2026-01-01", "2026-12-31")).toBe(364);
  });
});

describe("formatDateEs", () => {
  it("formatea una fecha legible con el año", () => {
    const out = formatDateEs("2026-09-12");
    expect(out).toMatch(/^\d{1,2}(\s+de)?\s+\S+(\s+de)?\s+\d{4}$/);
    expect(out).toContain("2026");
    expect(out).toContain("12");
  });

  it("devuelve null para valores inválidos", () => {
    expect(formatDateEs(null)).toBeNull();
    expect(formatDateEs("")).toBeNull();
    expect(formatDateEs("no-es-fecha")).toBeNull();
  });
});

describe("todayString / nowIso", () => {
  it("todayString usa el formato YYYY-MM-DD", () => {
    expect(todayString()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("la zona de la app es Bogotá", () => {
    expect(APP_TZ).toBe("America/Bogota");
  });

  it("nowIso devuelve un ISO válido", () => {
    expect(nowIso()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
