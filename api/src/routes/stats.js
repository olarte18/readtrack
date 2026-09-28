const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const { globalUserLimiter } = require("../middleware/rateLimit");
const { validate } = require("../utils/validators");
const httpError = require("../utils/httpError");
const cache = require("../utils/cache");
const { computeStreaks } = require("../utils/streaks");
const { getQualifyingDates, appToday } = require("../utils/streakDays");
const { bucketReadingDays, dayMs } = require("../utils/sessionDays");

router.use(authMiddleware);
router.use(globalUserLimiter);

// GET /stats/streak — racha actual y récord, sin cargar el calendario completo
router.get("/streak", async (req, res) => {
  // La clave empieza con `stats:<uid>` para que guardar una sesión la invalide
  // (cache.delPrefix borra por prefijo) y el flame no quede obsoleto.
  const cacheKey = `stats:${req.userId}:streak`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const buckets = await bucketReadingDays(req.userId);
  const dates = await getQualifyingDates(req.userId, buckets);
  const streak = computeStreaks(dates);
  const today = await appToday();
  const todayCounts = dates.includes(today);

  // ¿Hubo al menos una sesión hoy (hora Bogotá)? No depende de los minutos
  // (una sesión corta de <1 min iba a dar 0 minutos y apagaba la racha). Una
  // sesión que cruza la medianoche ya repartió su tiempo: basta con que toque
  // hoy.
  const hasSessionToday = buckets.some((b) => b.date === today);

  const payload = { ...streak, hasSessionToday, todayCounts };
  cache.set(cacheKey, payload, 60000);
  res.json(payload);
});

// GET /stats?year=YYYY — mismas stats, pero las del año (completados/meta) usan el año pedido
// en lugar del actual.
router.get("/", async (req, res) => {
  const qYear = Number(req.query.year);
  const year = Number.isInteger(qYear) && qYear >= 1970 && qYear <= 2100 ? qYear : new Date().getFullYear();
  const cacheKey = `stats:${req.userId}:${year}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const { rows: base } = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE status = 'reading')   AS reading,
      COUNT(*) FILTER (WHERE status = 'pending')   AS pending,
      COUNT(*) FILTER (WHERE status = 'wishlist')  AS wishlist,
      COUNT(*) FILTER (WHERE status = 'paused')    AS paused,
      COUNT(*) FILTER (WHERE status = 'abandoned') AS abandoned,
      COALESCE(SUM(b.pages) FILTER (WHERE ub.status = 'completed'), 0) AS total_pages,
      COALESCE(ROUND(AVG(ub.rating) FILTER (WHERE ub.rating IS NOT NULL), 1), 0) AS avg_rating
    FROM user_books ub
    JOIN books b ON ub.book_id = b.id
    WHERE ub.user_id = $1
      AND ub.is_archived = FALSE
  `, [req.userId]);

  const { rows: yearRows } = await pool.query(`
    SELECT COUNT(*) AS completed_this_year
    FROM user_books
    WHERE user_id = $1
      AND status = 'completed'
      AND is_archived = FALSE
      AND EXTRACT(YEAR FROM finished_at) = $2
  `, [req.userId, year]);

  const { rows: goalRows } = await pool.query(
    "SELECT value FROM reading_goals WHERE user_id = $1 AND year = $2 AND type = 'annual'",
    [req.userId, year]
  );

  const { rows: speedRows } = await pool.query(`
    SELECT ROUND((AVG(b.pages::float / NULLIF(finished_at - started_at, 0)))::numeric, 1) AS pages_per_day
    FROM user_books ub
    JOIN books b ON ub.book_id = b.id
    WHERE ub.user_id = $1
      AND ub.status = 'completed'
      AND ub.is_archived = FALSE
      AND ub.started_at IS NOT NULL
      AND ub.finished_at IS NOT NULL
      AND ub.finished_at > ub.started_at
  `, [req.userId]);

  const payload = {
    ...base[0],
    completed_this_year: parseInt(yearRows[0].completed_this_year),
    goal_this_year: goalRows[0]?.value ?? null,
    pages_per_day: speedRows[0]?.pages_per_day ?? null,
    year,
  };
  cache.set(cacheKey, payload, 60000);
  res.json(payload);
});

// GET /stats/goal
router.get("/goal", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT reading_goal FROM users WHERE id = $1",
    [req.userId]
  );
  const year = new Date().getFullYear();
  const { rows: progress } = await pool.query(
    `SELECT COUNT(*) AS completed_this_year
     FROM user_books
     WHERE user_id = $1 AND status = 'completed'
       AND is_archived = FALSE
     AND EXTRACT(YEAR FROM finished_at) = $2`,
    [req.userId, year]
  );
  res.json({
    goal: rows[0].reading_goal ?? 0,
    completed: parseInt(progress[0].completed_this_year),
    year,
  });
});

// PATCH /stats/goal
router.patch("/goal", async (req, res) => {
  const data = validate(req.body, {
    goal: { required: true, type: "integer", min: 1 },
  });

  await pool.query("UPDATE users SET reading_goal = $1 WHERE id = $2", [data.goal, req.userId]);
  res.json({ message: "Meta actualizada", goal: data.goal });
});

// GET /stats/activity?view=year|month|week&year=YYYY&month=M&date=YYYY-MM-DD
// Minutos/páginas/sesiones por periodo, siempre en zona Bogotá:
//  - view=year  -> 12 buckets (meses del año)
//  - view=month -> un bucket por día del mes (exige year + month)
//  - view=week  -> 7 buckets (día de la semana que contiene `date`, lunes = inicio)
router.get("/activity", async (req, res) => {
  const data = validate(req.query, {
    view: { required: true, type: "string", enum: ["year", "month", "week"] },
    year: { type: "integer", min: 1970, max: 2100 },
    month: { type: "integer", min: 1, max: 12 },
  });

  if (data.view === "year" && data.year === undefined) throw httpError(400, "year es requerido");
  if (data.view === "month" && (data.year === undefined || data.month === undefined)) {
    throw httpError(400, "year y month son requeridos");
  }

  let rawDate = "";
  if (data.view === "week") {
    rawDate = typeof req.query.date === "string" ? req.query.date.trim() : "";
    const parsed = new Date(`${rawDate}T12:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rawDate) || Number.isNaN(parsed.getTime())) {
      throw httpError(400, "date no es válida");
    }
  }

  const cacheKey = `stats:activity:${req.userId}:${data.view}:${data.year ?? ""}:${data.month ?? ""}:${rawDate}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const dayTotals = new Map(); // date -> { seconds, pages, sessions:Set }
  for (const b of await bucketReadingDays(req.userId)) {
    let d = dayTotals.get(b.date);
    if (!d) { d = { seconds: 0, pages: 0, sessions: new Set() }; dayTotals.set(b.date, d); }
    d.seconds += Number(b.secs);
    d.pages += Number(b.pages);
    d.sessions.add(b.session_id);
  }

  let bucketKeys;
  let labelOf;
  let keep = null; // (date) => clave de bucket cuando el día entra en la vista
  let dailyGoal = null;
  let monthlyGoal = null;
  let monthlyGoalMetric = null;
  let monthlyGoalBooks = null;
  let weekStart = null;
  let booksByMonth = new Map();

  if (data.view === "year") {
    const labels = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    bucketKeys = labels.map((_, i) => String(i + 1).padStart(2, "0"));
    labelOf = (k) => labels[Number(k) - 1];
    const yearStr = String(data.year);
    keep = (date) => (date.slice(0, 4) === yearStr ? date.slice(5, 7) : null);
    const { rows: monthlyRows } = await pool.query(
      `SELECT metric, value FROM reading_goals
       WHERE user_id = $1 AND year = $2 AND type = 'monthly'`,
      [req.userId, data.year]
    );
    const monthly = monthlyRows[0];
    monthlyGoalMetric = monthly?.metric ?? null;
    if (monthly) {
      if (monthly.metric === "hours") monthlyGoal = Number(monthly.value) * 60;
      else if (monthly.metric === "minutes") monthlyGoal = Number(monthly.value);
      if (monthly.metric === "books") monthlyGoalBooks = Number(monthly.value);
    }
    const { rows: booksRows } = await pool.query(
      `SELECT TO_CHAR(ub.finished_at, 'MM') AS mm, COUNT(*)::int AS books
       FROM user_books ub
       WHERE ub.user_id = $1 AND ub.status = 'completed'
         AND ub.is_archived = FALSE
         AND ub.finished_at >= TO_DATE($2, 'YYYY')
         AND ub.finished_at < TO_DATE($2, 'YYYY') + INTERVAL '1 year'
       GROUP BY 1`,
      [req.userId, String(data.year)]
    );
    booksByMonth = new Map(booksRows.map((r) => [r.mm, r.books]));
  } else if (data.view === "month") {
    const start = `${data.year}-${String(data.month).padStart(2, "0")}`;
    bucketKeys = Array.from({ length: new Date(data.year, data.month, 0).getDate() }, (_, i) =>
      String(i + 1).padStart(2, "0")
    );
    labelOf = (k) => String(Number(k));
    keep = (date) => (date.slice(0, 7) === start ? date.slice(8, 10) : null);
    const { rows: dailyRows } = await pool.query(
      "SELECT value FROM reading_goals WHERE user_id = $1 AND year = $2 AND type = 'daily'",
      [req.userId, data.year]
    );
    dailyGoal = dailyRows[0]?.value ?? null;
  } else {
    const anchor = new Date(`${rawDate}T12:00:00Z`);
    const dow = (anchor.getUTCDay() + 6) % 7; // lunes = 0
    const monday = new Date(anchor.getTime() - dow * 86400000);
    weekStart = monday.toISOString().slice(0, 10);
    const weekMs = dayMs(weekStart);
    bucketKeys = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday.getTime() + i * 86400000);
      return d.toISOString().slice(0, 10);
    });
    keep = (date) => {
      const m = dayMs(date);
      return m >= weekMs && m < weekMs + 7 * 86400000 ? date : null;
    };
    const WEEK = ["L", "M", "X", "J", "V", "S", "D"];
    labelOf = (k) => WEEK[bucketKeys.indexOf(k) % 7];
    const { rows: dailyRows } = await pool.query(
      "SELECT value FROM reading_goals WHERE user_id = $1 AND year = $2 AND type = 'daily'",
      [req.userId, Number(weekStart.slice(0, 4))]
    );
    dailyGoal = dailyRows[0]?.value ?? null;
  }

  const byKey = new Map();
  for (const [date, d] of dayTotals) {
    const k = keep(date);
    if (k === null) continue;
    const acc = byKey.get(k) ?? { seconds: 0, pages: 0, sessions: new Set(), active_days: 0 };
    acc.seconds += d.seconds;
    acc.pages += d.pages;
    for (const id of d.sessions) acc.sessions.add(id);
    acc.active_days += 1;
    byKey.set(k, acc);
  }

  const buckets = bucketKeys.map((k) => {
    const acc = byKey.get(k);
    return {
      label: labelOf(k),
      minutes: acc ? Math.round(acc.seconds / 60) : 0,
      pages: acc ? acc.pages : 0,
      sessions: acc ? acc.sessions.size : 0,
      active_days: acc ? acc.active_days : 0,
      ...(data.view === "year" ? { books: booksByMonth.get(k) ?? 0 } : {}),
    };
  });

  const totals = buckets.reduce(
    (acc, b) => ({
      minutes: acc.minutes + b.minutes,
      pages: acc.pages + b.pages,
      sessions: acc.sessions + b.sessions,
      active_days: acc.active_days + b.active_days,
    }),
    { minutes: 0, pages: 0, sessions: 0, active_days: 0 }
  );

  const payload = {
    view: data.view,
    year: data.year ?? undefined,
    month: data.month ?? undefined,
    week_start: weekStart,
    daily_goal_minutes: dailyGoal,
    monthly_goal_minutes: monthlyGoal,
    monthly_goal_metric: monthlyGoalMetric,
    monthly_goal_books: monthlyGoalBooks,
    buckets,
    totals,
  };
  cache.set(cacheKey, payload, 60000);
  res.json(payload);
});

module.exports = router;