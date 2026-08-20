const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const httpError = require("../utils/httpError");
const { validate } = require("../utils/validators");

const GOOGLE_API = "https://www.googleapis.com/books/v1";

// GET /books/search?q=mistborn
router.get("/search", async (req, res) => {
  const { q } = req.query;
  if (!q) throw httpError(400, "Query requerida");

  const terms = q.trim().split(/\s+/).map((t) => `%${t}%`);
  const cached = await pool.query(
    `SELECT * FROM books WHERE title ILIKE ALL($1) OR author ILIKE ALL($1) LIMIT 15`,
    [terms]
  );

  if (cached.rows.length > 0) {
    return res.json({ source: "cache", books: cached.rows });
  }

  const response = await fetch(
    `${GOOGLE_API}/volumes?q=${encodeURIComponent(q)}&maxResults=15&key=${process.env.GOOGLE_BOOKS_API_KEY}`
  );
  const data = await response.json();

  if (!data.items) return res.json({ source: "google", books: [] });

  const books = data.items.map((item) => {
    const info = item.volumeInfo;
    return {
      google_id: item.id,
      title: info.title ?? "Sin título",
      author: info.authors?.[0] ?? "Autor desconocido",
      year: info.publishedDate?.split("-")[0] ?? null,
      pages: info.pageCount ?? null,
      cover: info.imageLinks?.thumbnail?.replace("http://", "https://") ?? null,
      isbn: info.industryIdentifiers?.[0]?.identifier ?? null,
      description: info.description ?? null,
      genre: info.categories?.[0] ?? null,
    };
  });

  for (const book of books) {
    await pool.query(
      `INSERT INTO books (google_id, title, author, cover, pages, year, isbn, description, genre)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (google_id) DO NOTHING`,
      [book.google_id, book.title, book.author, book.cover,
       book.pages, book.year, book.isbn, book.description, book.genre]
    );
  }

  res.json({ source: "google", books });
});

// GET /books/:id
router.get("/:id", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM books WHERE id = $1", [req.params.id]);
  if (rows.length === 0) throw httpError(404, "Libro no encontrado");
  res.json(rows[0]);
});

// PATCH /books/:google_id/pages
router.patch("/:google_id/pages", async (req, res) => {
  const data = validate(req.body, { pages: { required: true, type: "integer", min: 1 } });

  const { rows } = await pool.query(
    "UPDATE books SET pages = $1 WHERE google_id = $2 RETURNING *",
    [data.pages, req.params.google_id]
  );
  if (rows.length === 0) throw httpError(404, "Libro no encontrado");
  res.json(rows[0]);
});

module.exports = router;