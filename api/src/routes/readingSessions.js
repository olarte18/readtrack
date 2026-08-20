const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");

router.use(authMiddleware);

router.post("/", async (req, res) => {
  const { user_book_id, page, duration_seconds, pages_read } = req.body;
  if (!user_book_id || !page) return res.status(400).json({ error: "user_book_id y page requeridos" });
  try {
    const { rows } = await pool.query(
      "INSERT INTO reading_sessions (user_book_id, user_id, page, duration_seconds, pages_read) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [user_book_id, req.userId, page, duration_seconds ?? null, pages_read ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al registrar sesión" });
  }
});

router.get("/:user_book_id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT page, created_at FROM reading_sessions WHERE user_book_id = $1 AND user_id = $2 ORDER BY created_at ASC",
      [req.params.user_book_id, req.userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

router.get("/:user_book_id/speed", async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ error: "Error al calcular velocidad" });
  }
});
module.exports = router;
