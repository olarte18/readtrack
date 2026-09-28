const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const { globalUserLimiter } = require("../middleware/rateLimit");
const cache = require("../utils/cache");
const { computeStreaks } = require("../utils/streaks");
const { getQualifyingDates, appToday } = require("../utils/streakDays");
const { bucketReadingDays } = require("../utils/sessionDays");
const { appYear } = require("../utils/dates");

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

  const buckets = await bucketReadingDays(req.userId);
  const sessionDates = await getQualifyingDates(req.userId, buckets);
  const streakDates = new Set(sessionDates);
  const today = await appToday();
  const todayCounts = streakDates.has(today);

  // ¿Hubo al menos una sesión hoy (hora Bogotá)? Es global (no depende del mes
  // visible): así la racha/flame de la app no se apagan al navegar a otro mes.
  // Una sesión que cruza la medianoche ya repartió su tiempo: tocar hoy basta.
  const hasSessionToday = buckets.some((b) => b.date === today);

  const monthBuckets = buckets.filter((b) => b.date.startsWith(start));
  const bookIds = [...new Set(monthBuckets.map((b) => b.user_book_id))];
  let booksMap = new Map();
  if (bookIds.length > 0) {
    // El título vive en el catálogo (books); la sesión referencia la copia del
    // usuario (user_books.id), así que el join es user_books -> books por
    // book_id. NO casar user_books.id contra books.id (ids distintos).
    const { rows: bookRows } = await pool.query(
      `SELECT ub.id AS user_book_id, b.title, b.author, b.cover
       FROM user_books ub
       JOIN books b ON b.id = ub.book_id
       WHERE ub.id = ANY($1::int[]) AND ub.user_id = $2`,
      [bookIds, req.userId]
    );
    booksMap = new Map(bookRows.map((r) => [r.user_book_id, r]));
  }

  const dayMap = new Map();
  const bookAcc = new Map(); // `${date}:${user_book_id}` -> detalle por libro
  for (const b of monthBuckets) {
    let day = dayMap.get(b.date);
    if (!day) {
      day = {
        date: b.date,
        minutes: 0,
        pages: 0,
        books: [],
        counts: streakDates.has(b.date), // día que suma a la racha (regla mínima)
      };
      dayMap.set(b.date, day);
    }
    const minutes = Math.round(Number(b.secs) / 60);
    const pages = Number(b.pages);
    day.minutes += minutes;
    day.pages += pages;

    const bk = booksMap.get(b.user_book_id);
    const key = `${b.date}:${b.user_book_id}`;
    let acc = bookAcc.get(key);
    if (!acc) {
      acc = {
        user_book_id: b.user_book_id,
        title: bk?.title ?? null,
        author: bk?.author ?? null,
        cover: bk?.cover ?? null,
        minutes: 0,
        pages: 0,
      };
      bookAcc.set(key, acc);
      day.books.push(acc);
    }
    acc.minutes += minutes;
    acc.pages += pages;
  }

  const payload = {
    year,
    month,
    days: [...dayMap.values()].sort((a, b) => (a.date < b.date ? 1 : -1)),
    daily_goal_minutes: null,
    hasSessionToday,
    todayCounts,
    streak: computeStreaks(sessionDates),
  };

  const { rows: dailyGoalRows } = await pool.query(
    "SELECT value FROM reading_goals WHERE user_id = $1 AND year = $2 AND type = 'daily'",
    [req.userId, appYear()]
  );
  payload.daily_goal_minutes = dailyGoalRows[0]?.value ?? null;

  cache.set(cacheKey, payload, 60000);
  res.json(payload);
});

module.exports = router;
