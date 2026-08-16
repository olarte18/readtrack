const express = require("express");
const router = express.Router();
const pool = require("../db/connection");

const GOOGLE_API = "https://www.googleapis.com/books/v1";

// GET /books/search?q=mistborn
router.get("/search", async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: "Query requerida" });

  try {
    // 1. Buscar en caché (DB)
    const cached = await pool.query(
      `SELECT * FROM books WHERE title ILIKE $1 OR author ILIKE $1 LIMIT 15`,
      [`%${q}%`]
    );

    if (cached.rows.length > 0) {
      return res.json({ source: "cache", books: cached.rows });
    }

    // 2. Si no hay caché, consultar Google Books
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

    // 3. Guardar en DB (caché)
    for (const book of books) {
      await pool.query(
        `INSERT INTO books (google_id, title, author, cover, pages, year, isbn, description, genre)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (google_id) DO NOTHING`,
        [book.google_id, book.title, book.author, book.cover,
         book.pages, book.year, book.isbn, book.description, book.genre]
      );
    }

    return res.json({ source: "google", books });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error en el servidor" });
  }
});

// GET /books/:id
router.get("/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM books WHERE id = $1", [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Libro no encontrado" });
    res.json(rows[0]);
  } catch (error) {
    res.status(500).json({ error: "Error en el servidor" });
  }
});

module.exports = router;
