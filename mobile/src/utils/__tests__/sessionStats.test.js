import { formatClock } from "../dates";
import { sessionSeconds, computeSessionStats } from "../sessionStats";

describe("formatClock", () => {
  it("formatea MM:SS", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(5)).toBe("00:05");
    expect(formatClock(59)).toBe("00:59");
    expect(formatClock(60)).toBe("01:00");
    expect(formatClock(3599)).toBe("59:59");
  });

  it("incluye horas cuando corresponde", () => {
    expect(formatClock(3600)).toBe("1:00:00");
    expect(formatClock(3661)).toBe("1:01:01");
  });

  it("no baja de cero ni con valores raros", () => {
    expect(formatClock(-5)).toBe("00:00");
    expect(formatClock(null)).toBe("00:00");
    expect(formatClock(undefined)).toBe("00:00");
  });
});

describe("sessionSeconds", () => {
  const anchor = { base: 100, at: 1_000_000 };

  it("cronómetro suma el tiempo transcurrido", () => {
    expect(sessionSeconds(false, anchor, true, 1_005_000)).toBe(105);
  });

  it("temporizador resta el tiempo transcurrido", () => {
    expect(sessionSeconds(true, anchor, true, 1_005_000)).toBe(95);
  });

  it("pausado devuelve el valor base congelado", () => {
    expect(sessionSeconds(true, anchor, false, 1_999_999)).toBe(100);
    expect(sessionSeconds(false, anchor, false, 1_999_999)).toBe(100);
  });

  it("el temporizador no baja de cero", () => {
    expect(sessionSeconds(true, anchor, true, 2_000_000)).toBe(0);
  });

  it("sin ancla devuelve 0", () => {
    expect(sessionSeconds(false, null, true, 1_000_000)).toBe(0);
  });
});

describe("computeSessionStats", () => {
  const book = { reading_mode: "page", pages: 300, current_page: 0 };

  it("combina velocidad previa y actual", () => {
    const stats = computeSessionStats({ book, endPage: 20, startPage: 0, avgSpeed: 40, isTimer: false, duration: null, seconds: 1800 });
    expect(stats.pagesPerHour).toBe(40);
    expect(stats.readLabel).toBe("Páginas leídas");
    expect(stats.readValue).toBe("20");
  });

  it("estima páginas por velocidad previa si aún no hay avance", () => {
    const stats = computeSessionStats({ book, endPage: 0, startPage: 0, avgSpeed: 60, isTimer: false, duration: null, seconds: 1800 });
    expect(stats.readValue).toBe("30");
  });

  it("sin velocidad conocida no estima y no divide por cero", () => {
    const stats = computeSessionStats({ book, endPage: 0, startPage: 0, avgSpeed: null, isTimer: false, duration: null, seconds: 1800 });
    expect(stats.readValue).toBe("—");
    expect(stats.pagesPerHour).toBe(0);
    expect(stats.minutesLeft).toBeNull();
  });

  it("en modo porcentaje expresa el avance en %", () => {
    const pb = { reading_mode: "percentage", pages: 200, current_page: 0 };
    const stats = computeSessionStats({ book: pb, endPage: 10, startPage: 0, avgSpeed: 120, isTimer: false, duration: null, seconds: 1800 });
    expect(stats.readLabel).toBe("Avance");
    expect(stats.readValue).toBe("30%");
  });

  it("en temporizador usa el tiempo restante para las horas transcurridas", () => {
    // duration 3600s, restante 1800s => 0.5h leídas.
    const stats = computeSessionStats({ book, endPage: 20, startPage: 0, avgSpeed: 40, isTimer: true, duration: 3600, seconds: 1800 });
    expect(stats.readValue).toBe("20");
  });
});
