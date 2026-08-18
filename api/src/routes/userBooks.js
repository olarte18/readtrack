const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");

router.use(authMiddleware);

// GET /user-books
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ub.id, ub.status, ub.current_page, ub.rating, ub.started_at, ub.finished_at,
             b.title, b.author, b.cover, b.pages, b.year, b.genre, b.google_id
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      WHERE ub.user_id = $1
      ORDER BY ub.created_at DESC
    `, [req.userId]);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener biblioteca" });
  }
});

// POST /user-books
router.post("/", async (req, res) => {
  const { google_id, title, author, cover, pages, year, genre, isbn, description, status } = req.body;
  if (!google_id) return res.status(400).json({ error: "google_id es requerido" });

  try {
    await pool.query(`
      INSERT INTO books (google_id, title, author, cover, pages, year, genre, isbn, description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (google_id) DO NOTHING
    `, [google_id, title, author, cover, pages, year, genre, isbn, description]);

    const { rows: bookRows } = await pool.query(
      "SELECT id FROM books WHERE google_id = $1", [google_id]
    );
    const book_id = bookRows[0].id;

    const { rows } = await pool.query(`
      INSERT INTO user_books (book_id, user_id, status)
      VALUES ($1, $2, $3)
      RETURNING *
    `, [book_id, req.userId, status ?? "pending"]);

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al agregar libro" });
  }
});

// PATCH /user-books/:id
router.patch("/:id", async (req, res) => {
  const { status, current_page, rating, started_at, finished_at } = req.body;
  try {
    const { rows } = await pool.query(`
      UPDATE user_books
      SET status = COALESCE($1, status),
          current_page = COALESCE($2, current_page),
          rating = COALESCE($3, rating),
          started_at = COALESCE($4, started_at),
          finished_at = COALESCE($5, finished_at)
      WHERE id = $6 AND user_id = $7
      RETURNING *
    `, [status, current_page, rating, started_at, finished_at, req.params.id, req.userId]);

    if (rows.length === 0) return res.status(404).json({ error: "No encontrado" });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar" });
  }
});

// GET /user-books/check/:google_id
router.get("/check/:google_id", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ub.id, ub.status FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      WHERE b.google_id = $1 AND ub.user_id = $2
    `, [req.params.google_id, req.userId]);

    if (rows.length > 0) return res.json({ exists: true, status: rows[0].status, id: rows[0].id });
    res.json({ exists: false });
  } catch (error) {
    res.status(500).json({ error: "Error al verificar" });
  }
});

// DELETE /user-books/:id
router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM user_books WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
    res.json({ message: "Libro eliminado" });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar" });
  }
});

module.exports = router;