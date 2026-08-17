const express = require("express");
const router = express.Router();
const pool = require("../db/connection");

// GET /notes/:book_id — obtener notas de un libro
router.get("/:book_id", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT * FROM notes WHERE book_id = $1 ORDER BY created_at DESC",
      [req.params.book_id]
    );
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener notas" });
  }
});

// POST /notes — crear nota
router.post("/", async (req, res) => {
  const { book_id, content, page } = req.body;
  if (!book_id || !content) return res.status(400).json({ error: "book_id y content son requeridos" });
  try {
    const { rows } = await pool.query(
      "INSERT INTO notes (book_id, content, page) VALUES ($1, $2, $3) RETURNING *",
      [book_id, content, page ?? null]
    );
    res.status(201).json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al crear nota" });
  }
});

// DELETE /notes/:id — eliminar nota
router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM notes WHERE id = $1", [req.params.id]);
    res.json({ message: "Nota eliminada" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar nota" });
  }
});

module.exports = router;
