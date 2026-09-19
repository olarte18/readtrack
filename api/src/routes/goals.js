const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const { globalUserLimiter } = require("../middleware/rateLimit");
const httpError = require("../utils/httpError");
const { validate } = require("../utils/validators");
const cache = require("../utils/cache");
const { APP_TZ, appYear, SQL } = require("../utils/dates");

const TYPES = ["annual", "monthly", "weekly", "daily"];
const METRICS = ["books", "minutes", "hours"];

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

  const { rows: weeklyProgress } = await pool.query(
    `SELECT COALESCE(SUM(duration_seconds) / 60, 0) AS minutes
     FROM reading_sessions
     WHERE user_id = $1
     AND ${SQL.utcToApp()}
       >= date_trunc('week', ${SQL.nowInApp()})`,
    [req.userId]
  );

  const { rows: dailyProgress } = await pool.query(
    `SELECT COALESCE(SUM(duration_seconds) / 60, 0) AS minutes
     FROM reading_sessions
     WHERE user_id = $1
     AND ${SQL.utcToApp()}
       >= date_trunc('day', ${SQL.nowInApp()})`,
    [req.userId]
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

  const { rows: monthlyMinutesProgress } = await pool.query(
    `SELECT COALESCE(SUM(duration_seconds) / 60, 0) AS minutes
     FROM reading_sessions
     WHERE user_id = $1
     AND ${SQL.utcToApp()}
       >= date_trunc('month', ${SQL.nowInApp()})`,
    [req.userId]
  );

  const { rows: calendar } = await pool.query(
    `SELECT DATE(created_at) AS date, 
            COALESCE(SUM(duration_seconds) / 60, 0) AS minutes,
            COALESCE(SUM(pages_read), 0) AS pages
     FROM reading_sessions
     WHERE user_id = $1
     AND created_at >= NOW() - INTERVAL '90 days'
     GROUP BY DATE(created_at)
     ORDER BY date ASC`,
    [req.userId]
  );

  const payload = {
    goals,
    progress: {
      annual: parseInt(annualProgress[0].books),
      weekly_minutes: parseInt(weeklyProgress[0].minutes),
      weekly: Math.round(parseInt(weeklyProgress[0].minutes) / 60),
      monthly_books: parseInt(monthlyBooksProgress[0].books),
      monthly_minutes: parseInt(monthlyMinutesProgress[0].minutes),
      monthly_hours: Math.round(parseInt(monthlyMinutesProgress[0].minutes) / 60),
      daily: Math.round(parseInt(dailyProgress[0].minutes)),
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
  let endCond = "";
  if (data.type === "annual" && data.year !== undefined) {
    startExpr = `date_trunc('year', '${data.year}-01-01 00:00:00'::timestamp)`;
    intervalUnit = "year";
    label = String(data.year);
    endCond = `\n         AND ${SQL.utcToApp("rs.created_at")} < (${startExpr} + INTERVAL '1 year')`;
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
    const { rows: byBook } = await pool.query(
      `SELECT ub.id, ub.status, ub.current_page, ub.rating, ub.started_at, ub.finished_at, ub.reading_mode,
              b.id AS db_id, b.title, b.author, b.cover, b.pages,
              COALESCE(SUM(rs.duration_seconds), 0) / 60 AS minutes,
              COALESCE(SUM(rs.pages_read), 0) AS pages_read
       FROM reading_sessions rs
       JOIN user_books ub ON ub.id = rs.user_book_id
       JOIN books b ON b.id = ub.book_id
       WHERE rs.user_id = $1
         AND ${SQL.utcToApp("rs.created_at")} >= ${startExpr}${endCond}
       GROUP BY ub.id, b.id
       ORDER BY minutes DESC`,
      [req.userId]
    );
    books = byBook.map((r) => ({
      ...r,
      minutes: parseInt(r.minutes),
      pages_read: parseInt(r.pages_read),
    }));
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
  res.status(201).json(rows[0]);
});

module.exports = router;