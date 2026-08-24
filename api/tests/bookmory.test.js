const { buildPlan } = require("../src/utils/bookmoryImport");
const { bogotaDay } = require("../src/utils/bookmory");

// 2024-11-21T02:00Z = 2024-11-20 21:00 en Colombia
const DAY1_LOG = 1732154400000;
const DAY2_LOG = 1732266000000; // 2024-11-22T07:00Z = 2024-11-22 02:00 CO
const CACHE_DAY_LABEL = Date.parse("2024-11-25T00:00:00Z"); // rótulo de día local

describe("importador Bookmory", () => {
  const parsed = {
    books: [
      {
        bid: "B1",
        title: "Libro Páginas",
        author: "Autor Uno",
        status_list: ["DONE"],
        page_type: "PAGE",
        total_page: 200,
        real_total_page: 200,
        cur_page: 200,
        wishlist: false,
        reads: [
          {
            nth: 1,
            start: DAY1_LOG - 86400000,
            end: DAY2_LOG,
            star: 5,
            comment: "Buenísimo",
            status: "DONE",
            page_log_list: [
              { created_at: DAY1_LOG, page: 50, page_type: "PAGE" },
              { created_at: DAY2_LOG, page: 200, page_type: "PAGE" },
            ],
            read_timer_list: [
              { read_started_at: DAY1_LOG - 1800000, elapsed_sec: 1800, created_at: DAY1_LOG },
              { read_started_at: DAY2_LOG - 2400000, elapsed_sec: 2400, created_at: DAY2_LOG },
            ],
          },
          {
            nth: 2,
            start: DAY2_LOG + 1000,
            end: DAY2_LOG + 2000,
            star: 3,
            comment: "relectura",
            status: "DONE",
            page_log_list: [],
          },
        ],
      },
      {
        bid: "B2",
        title: "Libro Porcentaje",
        author: "Autor Dos",
        status_list: ["READING"],
        page_type: "PERCENT",
        total_page: 100,
        real_total_page: 400,
        cur_page: 10,
        reads: [
          {
            nth: 1,
            start: DAY1_LOG,
            end: null,
            star: 0,
            comment: "",
            status: "READING",
            page_log_list: [
              { created_at: DAY1_LOG, page: 0, page_type: "PERCENT" },
              { created_at: DAY2_LOG, page: 25, page_type: "PERCENT" },
            ],
          },
        ],
      },
    ],
    streakCaches: [{ dateMs: CACHE_DAY_LABEL, bids: ["B1"] }],
    tags: [{ name: "#Fantasy", bids: ["B1"] }, { name: "#Épico", bids: ["B1"] }, { name: "#Clásico", bids: ["B1"] }, { name: "#Extra", bids: ["B1"] }],
    notes: [],
    yearlyGoals: [{ year: 2026, goal: 20 }],
    dailyGoal: { seconds: 3600 },
  };

  const plan = buildPlan(parsed);

  test("mapea estados y páginas reales en modo PAGE", () => {
    const b = plan.books.find((x) => x.bid === "B1");
    expect(b.status).toBe("completed");
    expect(b.pages).toBe(200);
    expect(b.currentPage).toBe(200);
    expect(b.rating).toBe(5);
    expect(b.review).toBe("Buenísimo");
  });

  test("convierte progreso porcentual a páginas reales", () => {
    const b = plan.books.find((x) => x.bid === "B2");
    expect(b.pages).toBe(400);
    expect(b.status).toBe("reading");
    // sin cronómetros: solo la actualización con páginas forma sesión; delta 25% de 400
    expect(b.sessionDays.length).toBe(1);
    expect(b.sessionDays[0].pagesRead).toBe(100);
    expect(b.sessionDays[0].durationSec).toBeNull();
  });

  test("sintetiza sesiones por día en hora Colombia", () => {
    const b = plan.books.find((x) => x.bid === "B1");
    const days = b.sessionDays.map((s) => s.day);
    // DAY1_LOG cae el 20 de noviembre en Colombia
    expect(days).toContain(bogotaDay(DAY1_LOG));
    expect(days).toContain(bogotaDay(DAY2_LOG));
    const day1 = b.sessionDays.find((s) => s.day === bogotaDay(DAY1_LOG));
    expect(day1.pagesRead).toBe(0); // primer log no genera delta
    const day2 = b.sessionDays.find((s) => s.day === bogotaDay(DAY2_LOG));
    expect(day2.pagesRead).toBe(150); // 200 - 50
  });

  test("los cronómetros se importan como sesiones reales con duración", () => {
    const b = plan.books.find((x) => x.bid === "B1");
    const withDuration = b.sessionDays.filter((s) => s.durationSec !== null);
    expect(withDuration.length).toBe(2);
    const day2 = b.sessionDays.find((s) => s.day === bogotaDay(DAY2_LOG) && s.durationSec !== null);
    expect(day2.durationSec).toBe(2400);
    expect(day2.pagesRead).toBe(150); // páginas del log emparejado
  });

  test("el total de minutos suma las duraciones reales", () => {
    const minutes = plan.books.reduce(
      (a, b) => a + b.sessionDays.reduce((x, s) => x + Math.round((s.durationSec ?? 0) / 60), 0),
      0
    );
    expect(minutes).toBe(70); // (1800 + 2400) / 60
  });

  test("los días solo presentes en caches generan sesión mínima", () => {
    const b = plan.books.find((x) => x.bid === "B1");
    const label = new Date(CACHE_DAY_LABEL).toISOString().split("T")[0];
    const minimal = b.sessionDays.find((s) => s.day === label);
    expect(minimal).toBeDefined();
    expect(minimal.pagesRead).toBe(0);
  });

  test("máximo 3 categorías con la primera como principal", () => {
    const b = plan.books.find((x) => x.bid === "B1");
    expect(b.categories.length).toBe(3); // #Extra se descarta
    expect(b.categories[0]).toEqual({ name: "Fantasy", isPrimary: true });
    expect(b.categories.map((c) => c.name)).toEqual(["Fantasy", "Épico", "Clásico"]);
  });

  test("importa ciclos de relectura desde la segunda lectura", () => {
    const b = plan.books.find((x) => x.bid === "B1");
    expect(b.cycles.length).toBe(1);
    expect(b.cycles[0].nth).toBe(2);
    expect(b.cycles[0].rating).toBe(3);
  });

  test("importa metas anuales y diaria", () => {
    expect(plan.yearlyGoals).toEqual([{ year: 2026, value: 20 }]);
    expect(plan.dailyMinutes).toBe(60);
  });
});
