const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");

router.use(authMiddleware);

// GET /stats
router.get("/", async (req, res) => {
  try {
    const year = new Date().getFullYear();

    // Conteos y totales base
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

    // Libros completados este año
    const { rows: yearRows } = await pool.query(`
      SELECT COUNT(*) AS completed_this_year
      FROM user_books
      WHERE user_id = $1
        AND status = 'completed'
        AND EXTRACT(YEAR FROM finished_at) = $2
    `, [req.userId, year]);

    // Goal anual
    const { rows: goalRows } = await pool.query(
      "SELECT goal FROM reading_goals WHERE user_id = $1 AND year = $2",
      [req.userId, year]
    );

    // Velocidad promedio (páginas/día) de libros completados con fechas
    const { rows: speedRows } = await pool.query(`
      SELECT ROUND(AVG(b.pages::float / NULLIF(finished_at - started_at, 0)), 1) AS pages_per_day
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      WHERE ub.user_id = $1
        AND ub.status = 'completed'
        AND ub.started_at IS NOT NULL
        AND ub.finished_at IS NOT NULL
        AND ub.finished_at > ub.started_at
    `, [req.userId]);

    res.json({
      ...base[0],
      completed_this_year: parseInt(yearRows[0].completed_this_year),
      goal_this_year: goalRows[0]?.goal ?? null,
      pages_per_day: speedRows[0]?.pages_per_day ?? null,
      year,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});
// GET /stats/goal
router.get("/goal", async (req, res) => {
  try {
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
  } catch (error) {
    res.status(500).json({ error: "Error al obtener meta" });
  }
});

// PATCH /stats/goal
router.patch("/goal", async (req, res) => {
  const { goal } = req.body;
  if (!goal || isNaN(goal)) return res.status(400).json({ error: "Meta inválida" });
  try {
    await pool.query("UPDATE users SET reading_goal = $1 WHERE id = $2", [parseInt(goal), req.userId]);
    res.json({ message: "Meta actualizada", goal: parseInt(goal) });
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar meta" });
  }
});
module.exports = router;