const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const httpError = require("../utils/httpError");
const { validate } = require("../utils/validators");

const STATUSES = ["pending", "reading", "paused", "completed", "wishlist", "abandoned"];

router.use(authMiddleware);

// GET /user-books
router.get("/", async (req, res) => {
  const { rows } = await pool.query(`
    SELECT ub.id, ub.status, ub.current_page, ub.rating, ub.started_at, ub.finished_at, ub.review,
           b.title, b.author, b.cover, b.pages, b.year, b.genre, b.google_id
    FROM user_books ub
    JOIN books b ON ub.book_id = b.id
    WHERE ub.user_id = $1
    ORDER BY ub.created_at DESC
  `, [req.userId]);
  res.json(rows);
});

// POST /user-books
router.post("/", async (req, res) => {
  const data = validate(req.body, {
    google_id: { required: true, type: "string", max: 100 },
    title: { type: "string", max: 500 },
    author: { type: "string", max: 300 },
    cover: { type: "string", max: 1000 },
    pages: { type: "integer", min: 1 },
    year: { type: "integer", min: 1, max: 2100 },
    genre: { type: "string", max: 100 },
    isbn: { type: "string", max: 50 },
    description: { type: "string", max: 5000 },
    status: { type: "string", enum: STATUSES },
  });

  await pool.query(`
    INSERT INTO books (google_id, title, author, cover, pages, year, genre, isbn, description)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
    ON CONFLICT (google_id) DO NOTHING
  `, [data.google_id, data.title, data.author, data.cover, data.pages,
       data.year, data.genre, data.isbn, data.description]);

  const { rows: bookRows } = await pool.query(
    "SELECT id FROM books WHERE google_id = $1", [data.google_id]
  );
  const book_id = bookRows[0].id;

  const { rows } = await pool.query(`
    INSERT INTO user_books (book_id, user_id, status)
    VALUES ($1, $2, $3)
    RETURNING *
  `, [book_id, req.userId, data.status ?? "pending"]);

  res.status(201).json(rows[0]);
});

// PATCH /user-books/:id
router.patch("/:id", async (req, res) => {
  const data = validate(req.body, {
    status: { type: "string", enum: STATUSES },
    current_page: { type: "integer", min: 0 },
    rating: { type: "integer", min: 1, max: 5 },
  });

  const { rows } = await pool.query(`
    UPDATE user_books
    SET status = COALESCE($1, status),
        current_page = COALESCE($2, current_page),
        rating = COALESCE($3, rating),
        started_at = COALESCE($4, started_at),
        finished_at = COALESCE($5, finished_at)
    WHERE id = $6 AND user_id = $7
    RETURNING *
  `, [data.status, data.current_page, data.rating, req.body.started_at, req.body.finished_at,
       req.params.id, req.userId]);

  if (rows.length === 0) throw httpError(404, "No encontrado");
  res.json(rows[0]);
});

// GET /user-books/check/:google_id
router.get("/check/:google_id", async (req, res) => {
  const { rows } = await pool.query(`
    SELECT ub.id, ub.status, ub.started_at, ub.finished_at FROM user_books ub
    JOIN books b ON ub.book_id = b.id
    WHERE b.google_id = $1 AND ub.user_id = $2
  `, [req.params.google_id, req.userId]);

  if (rows.length > 0) return res.json({ exists: true, status: rows[0].status, id: rows[0].id });
  res.json({ exists: false });
});

// DELETE /user-books/:id
router.delete("/:id", async (req, res) => {
  const result = await pool.query("DELETE FROM user_books WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
  if (result.rowCount === 0) throw httpError(404, "Libro no encontrado");
  res.json({ message: "Libro eliminado" });
});

module.exports = router;