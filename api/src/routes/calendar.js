const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const cache = require("../utils/cache");
const { computeStreaks } = require("../utils/streaks");

router.use(authMiddleware);

// GET /calendar/:year/:month — actividad diaria del mes con detalle por libro
router.get("/:year/:month", async (req, res) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 1970 || year > 2100) {
    return res.status(400).json({ error: "Mes o año inválido" });
  }

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const cacheKey = `calendar:${req.userId}:${start}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const { rows } = await pool.query(
    `SELECT TO_CHAR(rs.created_at, 'YYYY-MM-DD') AS date,
            rs.user_book_id,
            SUM(rs.duration_seconds) / 60 AS minutes,
            SUM(rs.pages_read) AS pages,
            b.title, b.author, b.cover
     FROM reading_sessions rs
     JOIN user_books ub ON ub.id = rs.user_book_id
     JOIN books b ON b.id = ub.book_id
     WHERE rs.user_id = $1
       AND rs.created_at >= $2::date
       AND rs.created_at < ($2::date + INTERVAL '1 month')
     GROUP BY TO_CHAR(rs.created_at, 'YYYY-MM-DD'), rs.user_book_id, b.title, b.author, b.cover
     ORDER BY date DESC`,
    [req.userId, start]
  );

  const dayMap = new Map();
  for (const row of rows) {
    if (!dayMap.has(row.date)) {
      dayMap.set(row.date, { date: row.date, minutes: 0, pages: 0, books: [] });
    }
    const day = dayMap.get(row.date);
    const minutes = parseInt(row.minutes) || 0;
    const pages = parseInt(row.pages) || 0;
    day.minutes += minutes;
    day.pages += pages;
    day.books.push({
      user_book_id: row.user_book_id,
      title: row.title,
      author: row.author,
      cover: row.cover,
      minutes,
      pages,
    });
  }

  const { rows: sessionDates } = await pool.query(
    `SELECT DISTINCT TO_CHAR(created_at, 'YYYY-MM-DD') AS date
     FROM reading_sessions
     WHERE user_id = $1`,
    [req.userId]
  );

  const payload = {
    year,
    month,
    days: [...dayMap.values()],
    streak: computeStreaks(sessionDates.map((r) => r.date)),
  };
  cache.set(cacheKey, payload, 60000);
  res.json(payload);
});

module.exports = router;
