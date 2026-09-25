const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const { globalUserLimiter } = require("../middleware/rateLimit");
const cache = require("../utils/cache");
const { computeStreaks } = require("../utils/streaks");
const { getQualifyingDates, appToday } = require("../utils/streakDays");
const { appYear, SQL } = require("../utils/dates");

router.use(authMiddleware);
router.use(globalUserLimiter);

// GET /calendar/:year/:month — actividad diaria del mes con detalle por libro
router.get("/:year/:month", async (req, res) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 1970 || year > 2100) {
    return res.status(400).json({ error: "Mes o año inválido" });
  }

  const start = `${year}-${String(month).padStart(2, "0")}`;
  const cacheKey = `calendar:${req.userId}:${start}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const { rows } = await pool.query(
    `SELECT ${SQL.toChar("rs.created_at")} AS date,
            rs.user_book_id,
            SUM(rs.duration_seconds) / 60 AS minutes,
            SUM(rs.pages_read) AS pages,
            b.title, b.author, b.cover
     FROM reading_sessions rs
     JOIN user_books ub ON ub.id = rs.user_book_id
     JOIN books b ON b.id = ub.book_id
     WHERE rs.user_id = $1
       AND TO_CHAR(${SQL.utcToApp("rs.created_at")}, 'YYYY-MM') = $2
     GROUP BY 1, rs.user_book_id, b.title, b.author, b.cover
     ORDER BY date DESC`,
    [req.userId, start]
  );

  const sessionDates = await getQualifyingDates(req.userId);
  const streakDates = new Set(sessionDates);
  const today = await appToday();
  const todayCounts = streakDates.has(today);

  const { rows: dailyGoalRows } = await pool.query(
    "SELECT value FROM reading_goals WHERE user_id = $1 AND year = $2 AND type = 'daily'",
    [req.userId, appYear()]
  );

  // ¿Hubo al menos una sesión hoy (hora Bogotá)? Es global (no depende del mes
  // visible): así la racha/flame de la app no se apagan al navegar a otro mes.
  const { rows: todaySessions } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM reading_sessions
     WHERE user_id = $1
       AND ${SQL.utcToApp()}
         >= date_trunc('day', ${SQL.nowInApp()})`,
    [req.userId]
  );
  const hasSessionToday = todaySessions[0].n > 0;

  const dayMap = new Map();
  for (const row of rows) {
    if (!dayMap.has(row.date)) {
      dayMap.set(row.date, {
        date: row.date,
        minutes: 0,
        pages: 0,
        books: [],
        counts: streakDates.has(row.date), // día que suma a la racha (regla mínima)
      });
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

  const payload = {
    year,
    month,
    days: [...dayMap.values()],
    daily_goal_minutes: dailyGoalRows[0]?.value ?? null,
    hasSessionToday,
    todayCounts,
    streak: computeStreaks(sessionDates),
  };
  cache.set(cacheKey, payload, 60000);
  res.json(payload);
});

module.exports = router;
