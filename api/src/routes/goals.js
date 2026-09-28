const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const { globalUserLimiter } = require("../middleware/rateLimit");
const httpError = require("../utils/httpError");
const { validate } = require("../utils/validators");
const cache = require("../utils/cache");
const { recheckAchievements, withFreshAchievements } = require("../utils/achievements");
const { bucketReadingDays, appBoundaries, dayMs } = require("../utils/sessionDays");
const { APP_TZ, appYear, SQL } = require("../utils/dates");

const TYPES = ["annual", "monthly", "weekly", "daily"];
const METRICS = ["books", "minutes", "hours"];

// Inicio/fin (ms, medianoche UTC de cada fecha app) del periodo pedido para
// /goals/detail. El año sin `year` usa el año actual Bogotá; monthly y weekly
// se anclan a los límites actuales.
function periodMs(data, boundaries) {
  if (data.type === "annual") {
    const year = data.year !== undefined ? data.year : appYear();
    const startMs = Date.parse(`${year}-01-01T00:00:00Z`);
    return { startMs, endMs: Date.parse(`${year + 1}-01-01T00:00:00Z`) };
  }
  if (data.type === "monthly") {
    return { startMs: dayMs(boundaries.month), endMs: Infinity };
  }
  return { startMs: dayMs(boundaries.week), endMs: dayMs(boundaries.week) + 7 * 86400000 };
}

router.use(authMiddleware);
router.use(globalUserLimiter);

// GET /goals — obtener todas las metas del año actual
router.get("/", async (req, res) => {
  const year = appYear();
  const cacheKey = `goals:${req.userId}:${year}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const { rows: goals } = await pool.query(
    "SELECT * FROM reading_goals WHERE user_id = $1 AND year = $2",
    [req.userId, year]
  );

  const { rows: annualProgress } = await pool.query(
    `SELECT COUNT(*) AS books
     FROM user_books
     WHERE user_id = $1 AND status = 'completed'
       AND is_archived = FALSE
       AND finished_at >= date_trunc('year', NOW() AT TIME ZONE $2)::date
       AND finished_at < (date_trunc('year', NOW() AT TIME ZONE $2) + INTERVAL '1 year')::date`,
    [req.userId, APP_TZ]
  );

  const { rows: monthlyBooksProgress } = await pool.query(
    `SELECT COUNT(*) AS books
     FROM user_books
     WHERE user_id = $1 AND status = 'completed'
       AND is_archived = FALSE
       AND finished_at >= date_trunc('month', NOW() AT TIME ZONE $2)::date
       AND finished_at < (date_trunc('month', NOW() AT TIME ZONE $2) + INTERVAL '1 month')::date`,
    [req.userId, APP_TZ]
  );

  // Minutos por periodo según los lapsos de las sesiones (sessionDays): una
  // sesión que cruza la medianoche ya repartió el tiempo entre los días.
  const [boundaries, buckets] = await Promise.all([appBoundaries(), bucketReadingDays(req.userId)]);
  const weekMs = dayMs(boundaries.week);
  const monthPrefix = boundaries.month.slice(0, 7);
  const calCutMs = dayMs(boundaries.day) - 90 * 86400000;
  let dailySeconds = 0;
  let weeklySeconds = 0;
  let monthlySeconds = 0;
  const calDays = new Map(); // date -> { date, minutes, pages }
  for (const b of buckets) {
    const secs = Number(b.secs);
    if (b.date === boundaries.day) dailySeconds += secs;
    if (dayMs(b.date) >= weekMs) weeklySeconds += secs;
    if (b.date.slice(0, 7) === monthPrefix) monthlySeconds += secs;
    if (dayMs(b.date) >= calCutMs) {
      const d = calDays.get(b.date) ?? { date: b.date, minutes: 0, pages: 0 };
      d.minutes += Math.round(secs / 60);
      d.pages += Number(b.pages);
      calDays.set(b.date, d);
    }
  }
  const weeklyMinutes = Math.round(weeklySeconds / 60);
  const monthlyMinutes = Math.round(monthlySeconds / 60);
  const calendar = [...calDays.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

  const payload = {
    goals,
    progress: {
      annual: parseInt(annualProgress[0].books),
      weekly_minutes: weeklyMinutes,
      weekly: Math.round(weeklyMinutes / 60),
      monthly_books: parseInt(monthlyBooksProgress[0].books),
      monthly_minutes: monthlyMinutes,
      monthly_hours: Math.round(monthlyMinutes / 60),
      daily: Math.round(dailySeconds / 60),
    },
    calendar,
    year,
  };
  cache.set(cacheKey, payload, 60000);
  res.json(payload);
});

// GET /goals/status — ¿el usuario ha configurado alguna meta (de cualquier año)?
// Ligero: lo usa el onboarding para no volver a preguntar metas a quien ya las tiene.
router.get("/status", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT EXISTS(SELECT 1 FROM reading_goals WHERE user_id = $1) AS has",
    [req.userId]
  );
  res.json({ hasGoals: rows[0].has });
});

// GET /goals/detail?type=annual|monthly|weekly&metric=books|hours
// Desglose de la meta: libros completados en el periodo (books) o
// minutos por libro leídos en el periodo (hours).
router.get("/detail", async (req, res) => {
  const data = validate(req.query, {
    type: { required: true, type: "string", enum: ["annual", "monthly", "weekly"] },
    metric: { required: true, type: "string", enum: ["books", "hours"] },
    year: { type: "integer", min: 1970, max: 2100 },
  });

  const cacheKey = `goals:${req.userId}:detail:${data.type}:${data.metric}:${data.year ?? ""}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  let startExpr;
  let intervalUnit;
  let label;
  if (data.type === "annual" && data.year !== undefined) {
    startExpr = `date_trunc('year', '${data.year}-01-01 00:00:00'::timestamp)`;
    intervalUnit = "year";
    label = String(data.year);
  } else if (data.type === "annual") {
    startExpr = `date_trunc('year', ${SQL.nowInApp()})`;
    intervalUnit = "year";
    label = "este año";
  } else if (data.type === "monthly") {
    startExpr = `date_trunc('month', ${SQL.nowInApp()})`;
    intervalUnit = "month";
    label = "este mes";
  } else {
    startExpr = `date_trunc('week', ${SQL.nowInApp()})`;
    intervalUnit = "week";
    label = "esta semana";
  }

  let books = [];
  let progress = 0;

  if (data.metric === "books") {
    const { rows: completed } = await pool.query(
      `SELECT ub.id, ub.status, ub.current_page, ub.rating, ub.started_at, ub.finished_at, ub.reading_mode,
              b.id AS db_id, b.title, b.author, b.cover, b.pages
       FROM user_books ub
       JOIN books b ON b.id = ub.book_id
       WHERE ub.user_id = $1 AND ub.status = 'completed'
         AND ub.is_archived = FALSE
         AND ub.finished_at >= ${startExpr}::date
         AND ub.finished_at < (${startExpr} + INTERVAL '1 ${intervalUnit}')::date
       ORDER BY ub.finished_at DESC`,
      [req.userId]
    );
    books = completed.map((r) => ({ ...r, minutes: null }));
    progress = books.length;
  } else {
    // Minutos por libro del periodo, según los lapsos de las sesiones
    // (sessionDays reparte los cruces de medianoche entre los días que toca).
    const boundaries = await appBoundaries();
    const buckets = await bucketReadingDays(req.userId);
    const { startMs, endMs } = periodMs(data, boundaries);
    const grouped = new Map(); // user_book_id -> { seconds, pages }
    for (const b of buckets) {
      const m = dayMs(b.date);
      if (m < startMs || (endMs !== Infinity && m >= endMs)) continue;
      const g = grouped.get(b.user_book_id) ?? { seconds: 0, pages: 0 };
      g.seconds += Number(b.secs);
      g.pages += Number(b.pages);
      grouped.set(b.user_book_id, g);
    }

    if (grouped.size > 0) {
      const ids = [...grouped.keys()];
      const { rows: meta } = await pool.query(
        `SELECT ub.id, ub.status, ub.current_page, ub.rating, ub.started_at, ub.finished_at, ub.reading_mode,
                b.id AS db_id, b.title, b.author, b.cover, b.pages
         FROM user_books ub
         JOIN books b ON b.id = ub.book_id
         WHERE ub.user_id = $1 AND ub.id = ANY($2::int[])`,
        [req.userId, ids]
      );
      const metaMap = new Map(meta.map((r) => [r.id, r]));
      books = [...grouped.entries()]
        .map(([id, g]) => ({ ...metaMap.get(id), minutes: Math.round(g.seconds / 60), pages_read: Math.round(g.pages) }))
        .filter((b) => b.id !== undefined)
        .sort((a, b) => b.minutes - a.minutes);
    }
    progress = books.reduce((acc, b) => acc + b.minutes, 0);
  }

  const payload = {
    type: data.type,
    metric: data.metric,
    period: label,
    progress,
    books,
  };
  cache.set(cacheKey, payload, 60000);
  res.json(payload);
});

// POST /goals — crear o actualizar meta
router.post("/", async (req, res) => {
  const data = validate(req.body, {
    type: { required: true, type: "string", enum: TYPES },
    metric: { required: true, type: "string", enum: METRICS },
    value: { required: true, type: "integer", min: 1 },
  });
  const year = appYear();

  const { rows } = await pool.query(
    `INSERT INTO reading_goals (user_id, type, metric, value, year)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id, type, year)
     DO UPDATE SET metric = $3, value = $4
     RETURNING *`,
    [req.userId, data.type, data.metric, data.value, year]
  );
  cache.delPrefix(`goals:${req.userId}`);
  cache.delPrefix(`stats:${req.userId}`);
  cache.delPrefix(`calendar:${req.userId}`);
  let ach = null;
  try { ach = await recheckAchievements(req.userId); } catch {}
  res.status(201).json(await withFreshAchievements(rows[0], ach));
});

module.exports = router;