const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const httpError = require("../utils/httpError");
const { validate } = require("../utils/validators");
const cache = require("../utils/cache");

const TYPES = ["annual", "monthly", "weekly", "daily"];
const METRICS = ["books", "minutes", "hours"];

router.use(authMiddleware);

// GET /goals — obtener todas las metas del año actual
router.get("/", async (req, res) => {
  const year = new Date().getFullYear();
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
     AND EXTRACT(YEAR FROM finished_at) = $2`,
    [req.userId, year]
  );

  const { rows: weeklyProgress } = await pool.query(
    `SELECT COALESCE(SUM(duration_seconds) / 60, 0) AS minutes
     FROM reading_sessions
     WHERE user_id = $1
     AND created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'
       >= date_trunc('week', NOW() AT TIME ZONE 'America/Bogota')`,
    [req.userId]
  );

  const { rows: dailyProgress } = await pool.query(
    `SELECT COALESCE(SUM(duration_seconds) / 60, 0) AS minutes
     FROM reading_sessions
     WHERE user_id = $1
     AND created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'
       >= date_trunc('day', NOW() AT TIME ZONE 'America/Bogota')`,
    [req.userId]
  );

  const { rows: monthlyBooksProgress } = await pool.query(
    `SELECT COUNT(*) AS books
     FROM user_books
     WHERE user_id = $1 AND status = 'completed'
     AND EXTRACT(YEAR FROM finished_at) = $2
     AND EXTRACT(MONTH FROM finished_at) = $3`,
    [req.userId, year, new Date().getMonth() + 1]
  );

  const { rows: monthlyMinutesProgress } = await pool.query(
    `SELECT COALESCE(SUM(duration_seconds) / 60, 0) AS minutes
     FROM reading_sessions
     WHERE user_id = $1
     AND created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'
       >= date_trunc('month', NOW() AT TIME ZONE 'America/Bogota')`,
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

// POST /goals — crear o actualizar meta
router.post("/", async (req, res) => {
  const data = validate(req.body, {
    type: { required: true, type: "string", enum: TYPES },
    metric: { required: true, type: "string", enum: METRICS },
    value: { required: true, type: "integer", min: 1 },
  });
  const year = new Date().getFullYear();

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
  res.status(201).json(rows[0]);
});

module.exports = router;