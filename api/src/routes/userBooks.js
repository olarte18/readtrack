const express = require("express");
const router = express.Router();
const pool = require("../db/connection");

// GET /user-books — listar biblioteca
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT ub.id, ub.status, ub.current_page, ub.rating, ub.started_at, ub.finished_at,
             b.title, b.author, b.cover, b.pages, b.year, b.genre, b.google_id
      FROM user_books ub
      JOIN books b ON ub.book_id = b.id
      ORDER BY ub.created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener biblioteca" });
  }
});

// POST /user-books — agregar libro
router.post("/", async (req, res) => {
  const { google_id, title, author, cover, pages, year, genre, isbn, description, status } = req.body;

  try {
    // 1. Insertar libro si no existe
    await pool.query(`
      INSERT INTO books (google_id, title, author, cover, pages, year, genre, isbn, description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (google_id) DO NOTHING
    `, [google_id, title, author, cover, pages, year, genre, isbn, description]);

    // 2. Obtener id del libro
    const { rows: bookRows } = await pool.query(
      "SELECT id FROM books WHERE google_id = $1", [google_id]
    );
    const book_id = bookRows[0].id;

    // 3. Crear relación user_book
    const { rows } = await pool.query(`
      INSERT INTO user_books (book_id, status)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
      RETURNING *
    `, [book_id, status ?? "pending"]);

    res.status(201).json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al agregar libro" });
  }
});

// PATCH /user-books/:id — actualizar estado o página
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
      WHERE id = $6
      RETURNING *
    `, [status, current_page, rating, started_at, finished_at, req.params.id]);

    if (rows.length === 0) return res.status(404).json({ error: "No encontrado" });
    res.json(rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar" });
  }
});

// DELETE /user-books/:id — quitar libro
router.delete("/:id", async (req, res) => {
  try {
    await pool.query("DELETE FROM user_books WHERE id = $1", [req.params.id]);
    res.json({ message: "Libro eliminado de la biblioteca" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al eliminar" });
  }
});

module.exports = router;
