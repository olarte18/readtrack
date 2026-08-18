const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");

router.use(authMiddleware);

// GET /notes/:book_id
router.get("/:book_id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM notes WHERE book_id = $1 AND user_id = $2 ORDER BY created_at DESC",
      [req.params.book_id, req.userId]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener notas" });
  }
});

// POST /notes
router.post("/", async (req, res) => {
  const { book_id, content, page } = req.body;
  if (!book_id || !content) return res.status(400).json({ error: "book_id y content son requeridos" });
  try {
    const { rows } = await pool.query(
      "INSERT INTO notes (book_id, user_id, content, page) VALUES ($1, $2, $3, $4) RETURNING *",
      [book_id, req.userId, content, page ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al crear nota" });
  }
});

// DELETE /notes/:id
router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM notes WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
    res.json({ message: "Nota eliminada" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar nota" });
  }
});

module.exports = router;