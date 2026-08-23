const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const httpError = require("../utils/httpError");
const { validate } = require("../utils/validators");
const cache = require("../utils/cache");

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
  res.status(201).json(rows[0]);
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