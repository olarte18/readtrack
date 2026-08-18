const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");

router.use(authMiddleware);

// GET /stats
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'completed') AS completed,
        COUNT(*) FILTER (WHERE status = 'reading') AS reading,
        COUNT(*) FILTER (WHERE status = 'pending') AS pending,
        COUNT(*) FILTER (WHERE status = 'wishlist') AS wishlist,
        COUNT(*) FILTER (WHERE status = 'paused') AS paused,
        COUNT(*) FILTER (WHERE status = 'abandoned') AS abandoned,
        COALESCE(SUM(b.pages) FILTER (WHERE ub.status = 'completed'), 0) AS total_pages,
        COALESCE(ROUND(AVG(ub.rating) FILTER (WHERE ub.rating IS NOT NULL), 1), 0) AS avg_rating
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      WHERE ub.user_id = $1
    `, [req.userId]);

    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener estadísticas" });
  }
});

module.exports = router;
