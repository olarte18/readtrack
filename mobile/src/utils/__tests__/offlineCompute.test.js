import {
  computeStreaks,
  localToday,
  streakWithLocal,
  calendarWithLocal,
  goalsWithLocal,
  activityWithLocal,
} from "../offlineCompute";
import { todayString, addDays } from "../dates";

const today = todayString();
const [ty, tm, td] = today.split("-").map(Number);

const DAY = 86_400_000;
const sess = (seconds, pages, mode = "page", queuedAt = Date.now()) => ({
  type: "save-session",
  queuedAt,
  payload: { session: { duration_seconds: seconds, pages_read: pages, reading_mode: mode } },
});

describe("computeStreaks", () => {
  it("cuenta la racha que termina hoy", () => {
    const dates = [today, addDays(today, -1), addDays(today, -2)];
    expect(computeStreaks(dates)).toEqual({ current: 3, best: 3 });
  });

  it("no rompe la racha si hoy aún no hay sesión", () => {
    expect(computeStreaks([addDays(today, -1), addDays(today, -2)])).toEqual({ current: 2, best: 2 });
  });

  it("guarda la mejor racha pasada", () => {
    const dates = [today, addDays(today, -1), addDays(today, -10), addDays(today, -11), addDays(today, -12)];
    expect(computeStreaks(dates)).toEqual({ current: 2, best: 3 });
  });

  it("vacío da cero", () => {
    expect(computeStreaks([])).toEqual({ current: 0, best: 0 });
  });
});

describe("localToday", () => {
  it("solo conserva sesiones encoladas hoy (Bogotá)", () => {
    const items = [
      sess(300, 5),
      sess(300, 5, "page", Date.now() - 3 * DAY),
      { type: "otro", queuedAt: Date.now() },
    ];
    expect(localToday(items)).toHaveLength(1);
  });
});

describe("streakWithLocal", () => {
  const cached = { hasSessionToday: false, todayCounts: false, current: 5, best: 5 };

  it("devuelve el caché tal cual si es null", () => {
    expect(streakWithLocal(null, [])).toBeNull();
  });

  it("una sesión local que califica suma racha", () => {
    expect(streakWithLocal(cached, [sess(300, 2)])).toMatchObject({
      hasSessionToday: true,
      todayCounts: true,
      current: 6,
      best: 6,
    });
  });

  it("una sesión que no califica enciende el día pero no la racha", () => {
    expect(streakWithLocal(cached, [sess(100, 5)])).toMatchObject({
      hasSessionToday: true,
      todayCounts: false,
      current: 5,
    });
  });

  it("porcentaje califica con 7 minutos", () => {
    expect(streakWithLocal(cached, [sess(420, 0, "percentage")]).todayCounts).toBe(true);
  });

  it("no suma dos veces si el server ya contó hoy", () => {
    const counted = { hasSessionToday: true, todayCounts: true, current: 5, best: 5 };
    expect(streakWithLocal(counted, [sess(400, 5)]).current).toBe(5);
  });
});

describe("calendarWithLocal", () => {
  const base = {
    year: ty,
    month: tm,
    days: [{ date: today, minutes: 10, pages: 5, books: [] }],
    hasSessionToday: false,
    todayCounts: false,
    streak: { hasSessionToday: false, todayCounts: false, current: 1, best: 1 },
  };

  it("devuelve el caché tal cual si es null o sin locales", () => {
    expect(calendarWithLocal(null)).toBeNull();
    expect(calendarWithLocal(base, [])).toBe(base);
  });

  it("suma la sesión local a la celda de hoy", () => {
    const out = calendarWithLocal(base, [sess(120, 3)]);
    const day = out.days.find((d) => d.date === today);
    expect(day).toMatchObject({ minutes: 12, pages: 8 });
    expect(out.hasSessionToday).toBe(true);
  });

  it("si el mes visible no es el actual, no toca las celdas", () => {
    const other = { ...base, year: 2020, month: 1 };
    const out = calendarWithLocal(other, [sess(120, 3)]);
    expect(out.days).toEqual(other.days);
    expect(out.hasSessionToday).toBe(true);
  });
});

describe("goalsWithLocal", () => {
  const base = {
    progress: { daily: 10 },
    calendar: [],
    streak: { hasSessionToday: false, todayCounts: false, current: 1, best: 1 },
  };

  it("devuelve el caché tal cual si es null o sin locales", () => {
    expect(goalsWithLocal(null)).toBeNull();
    expect(goalsWithLocal(base, [])).toBe(base);
  });

  it("suma los minutos locales a la meta diaria y al calendario", () => {
    const out = goalsWithLocal(base, [sess(120, 3)]);
    expect(out.progress.daily).toBe(12);
    expect(out.calendar.some((d) => d.date === today)).toBe(true);
  });
});

describe("activityWithLocal", () => {
  it("devuelve el caché tal cual si es null o sin locales", () => {
    expect(activityWithLocal(null)).toBeNull();
    const base = { view: "week", week_start: addDays(today, -3), buckets: [], totals: {} };
    expect(activityWithLocal(base, [])).toBe(base);
  });

  it("semana: suma al bucket de hoy y a los totals", () => {
    const buckets = Array.from({ length: 7 }, () => ({ minutes: 0, pages: 0, sessions: 0, active_days: 0 }));
    const base = {
      view: "week",
      week_start: addDays(today, -3),
      buckets,
      totals: { minutes: 0, pages: 0, sessions: 0, active_days: 0 },
    };
    const out = activityWithLocal(base, [sess(120, 4)]);
    expect(out.buckets[3]).toMatchObject({ minutes: 2, pages: 4, sessions: 1, active_days: 1 });
    expect(out.totals).toMatchObject({ minutes: 2, pages: 4, sessions: 1, active_days: 1 });
  });

  it("mes: suma al bucket cuyo label es el día de hoy", () => {
    const base = {
      view: "month",
      year: ty,
      month: tm,
      buckets: [{ label: String(td), minutes: 0, pages: 0, sessions: 0, active_days: 0 }],
      totals: { minutes: 0, pages: 0, sessions: 0, active_days: 0 },
    };
    const out = activityWithLocal(base, [sess(60, 1)]);
    expect(out.buckets[0]).toMatchObject({ minutes: 1, pages: 1, sessions: 1 });
  });
});
