const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const httpError = require("../utils/httpError");
const { validate } = require("../utils/validators");
const cache = require("../utils/cache");
const { computeStreaks } = require("../utils/streaks");

router.use(authMiddleware);

router.post("/", async (req, res) => {
  const data = validate(req.body, {
    user_book_id: { required: true, type: "integer", min: 1 },
    page: { required: true, type: "integer", min: 0 },
    duration_seconds: { type: "integer", min: 0 },
    pages_read: { type: "integer", min: 0 },
  });

  const { rows } = await pool.query(
    "INSERT INTO reading_sessions (user_book_id, user_id, page, duration_seconds, pages_read) VALUES ($1, $2, $3, $4, $5) RETURNING *",
    [data.user_book_id, req.userId, data.page, data.duration_seconds, data.pages_read]
  );
  cache.delPrefix(`goals:${req.userId}`);
  cache.delPrefix(`calendar:${req.userId}`);

  // ¿Primera sesión del día? Con ella se define la racha de hoy.
  const { rows: prior } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM reading_sessions
     WHERE user_id = $1 AND created_at >= date_trunc('day', NOW()) AND id <> $2`,
    [req.userId, rows[0].id]
  );

  let streak = null;
  if (prior[0].n === 0) {
    const { rows: dates } = await pool.query(
      `SELECT DISTINCT TO_CHAR(created_at, 'YYYY-MM-DD') AS date
       FROM reading_sessions WHERE user_id = $1`,
      [req.userId]
    );
    streak = computeStreaks(dates.map((r) => r.date)).current;
  }

  res.status(201).json({ ...rows[0], first_today: prior[0].n === 0, streak });
});

router.get("/:user_book_id", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT page, created_at FROM reading_sessions WHERE user_book_id = $1 AND user_id = $2 ORDER BY created_at ASC",
    [req.params.user_book_id, req.userId]
  );
  res.json(rows);
});

router.get("/:user_book_id/speed", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT 
      AVG(pages_read::float / NULLIF(duration_seconds, 0) * 60) AS avg_pages_per_minute,
      COUNT(*) AS total_sessions
     FROM reading_sessions 
     WHERE user_book_id = $1 AND user_id = $2
     AND pages_read > 0 AND duration_seconds > 0`,
    [req.params.user_book_id, req.userId]
  );
  res.json(rows[0]);
});

module.exports = router;