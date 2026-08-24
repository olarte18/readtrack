const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const { validate } = require("../utils/validators");
const cache = require("../utils/cache");
const { computeStreaks } = require("../utils/streaks");

router.use(authMiddleware);

// GET /stats/streak — racha actual y récord, sin cargar el calendario completo
router.get("/streak", async (req, res) => {
  const cacheKey = `stats:streak:${req.userId}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const { rows } = await pool.query(
    `SELECT DISTINCT TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS date
     FROM reading_sessions WHERE user_id = $1`,
    [req.userId]
  );
  const streak = computeStreaks(rows.map((r) => r.date));
  cache.set(cacheKey, streak, 60000);
  res.json(streak);
});

// GET /stats
router.get("/", async (req, res) => {
  const year = new Date().getFullYear();
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
  `, [req.userId]);

  const { rows: yearRows } = await pool.query(`
    SELECT COUNT(*) AS completed_this_year
    FROM user_books
    WHERE user_id = $1
      AND status = 'completed'
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

module.exports = router;