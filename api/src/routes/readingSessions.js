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
  cache.delPrefix(`stats:${req.userId}`);

  // ¿Primera sesión del día (hora Colombia)? Con ella se define la racha de hoy.
  const { rows: prior } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM reading_sessions
     WHERE user_id = $1 AND id <> $2
       AND TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD')
         = TO_CHAR(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD')`,
    [req.userId, rows[0].id]
  );

  let streak = null;
  if (prior[0].n === 0) {
    const { rows: dates } = await pool.query(
      `SELECT DISTINCT TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS date
       FROM reading_sessions WHERE user_id = $1`,
      [req.userId]
    );
    streak = computeStreaks(dates.map((r) => r.date)).current;
  }

  res.status(201).json({ ...rows[0], first_today: prior[0].n === 0, streak });
});

router.patch("/:id", async (req, res) => {
  const data = validate(req.body, {
    page: { type: "integer", min: 0 },
    duration_seconds: { type: "integer", min: 0 },
    pages_read: { type: "integer", min: 0 },
  });
  if (Object.keys(data).length === 0) throw httpError(400, "No hay campos para actualizar");

  const fields = Object.keys(data);
  const sets = fields.map((f, i) => `${f} = $${i + 1}`).join(", ");
  const values = fields.map((f) => data[f]);

  const { rows } = await pool.query(
    `UPDATE reading_sessions SET ${sets}
     WHERE id = $${fields.length + 1} AND user_id = $${fields.length + 2}
     RETURNING *`,
    [...values, req.params.id, req.userId]
  );
  if (rows.length === 0) throw httpError(404, "Sesión no encontrada");

  cache.delPrefix(`goals:${req.userId}`);
  cache.delPrefix(`calendar:${req.userId}`);
  cache.delPrefix(`stats:${req.userId}`);

  // Si la sesión editada es la última del libro, sincronizar current_page
  // (así queda como si la sesión se hubiera guardado bien desde el inicio)
  if (data.page !== undefined) {
    const sessionId = rows[0].id;
    const { rows: latest } = await pool.query(
      `SELECT id FROM reading_sessions
       WHERE user_book_id = $1 AND user_id = $2
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [rows[0].user_book_id, req.userId]
    );
    if (latest[0]?.id === sessionId) {
      await pool.query(
        `UPDATE user_books ub
         SET current_page = $1,
             status = CASE WHEN b.pages IS NOT NULL AND $1 >= b.pages THEN 'completed' ELSE ub.status END,
             finished_at = CASE WHEN b.pages IS NOT NULL AND $1 >= b.pages THEN (NOW() AT TIME ZONE 'America/Bogota')::date ELSE ub.finished_at END
         FROM books b
         WHERE ub.id = $2 AND ub.user_id = $3 AND b.id = ub.book_id`,
        [data.page, rows[0].user_book_id, req.userId]
      );
    }
  }

  res.json(rows[0]);
});

router.get("/:user_book_id", async (req, res) => {
  const params = [req.params.user_book_id, req.userId];
  let dateFilter = "";
  if (req.query.date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.query.date)) {
      return res.status(400).json({ error: "Fecha inválida" });
    }
    dateFilter =
      "AND TO_CHAR(rs.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') = $3";
    params.push(req.query.date);
  }
  const { rows } = await pool.query(
    `SELECT rs.id, rs.page, rs.pages_read, rs.duration_seconds,
            TO_CHAR(rs.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota', 'HH24:MI') AS time_bogota
     FROM reading_sessions rs
     WHERE rs.user_book_id = $1 AND rs.user_id = $2 ${dateFilter}
     ORDER BY rs.created_at ASC`,
    params
  );
  res.json(rows);
});

router.get("/:user_book_id/speed", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT 
      AVG(pages_read::float / NULLIF(duration_seconds, 0) * 3600) AS avg_pages_per_hour,
      COUNT(*) AS total_sessions
     FROM reading_sessions 
     WHERE user_book_id = $1 AND user_id = $2
     AND pages_read > 0 AND duration_seconds > 0`,
    [req.params.user_book_id, req.userId]
  );
  res.json(rows[0]);
});

module.exports = router;