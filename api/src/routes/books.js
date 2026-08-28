const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const httpError = require("../utils/httpError");
const { validate } = require("../utils/validators");
const cache = require("../utils/cache");
const authMiddleware = require("../middleware/auth");

const GOOGLE_API = "https://www.googleapis.com/books/v1";
const OPENLIBRARY_API = "https://openlibrary.org";

const normKey = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchGoogleBooks(q) {
  // Google desde IPs de datacenter responde 503 intermitente si no puede
  // ubicar el país; el parámetro country lo resuelve y los reintentos cubren
  // los fallos residuales. Sin country devuelve 503 siempre.
  const keyParam = process.env.GOOGLE_BOOKS_API_KEY ? `&key=${process.env.GOOGLE_BOOKS_API_KEY}` : "";
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(
        `${GOOGLE_API}/volumes?q=${encodeURIComponent(q)}&maxResults=15&country=CO${keyParam}`
      );
      if (!response.ok) {
        const body = await response.text();
        console.error(`[books/search] Google Books ${response.status} (intento ${attempt + 1}): ${body.slice(0, 200)}`);
        if (attempt < 3) {
          await sleep(400 * 2 ** attempt);
          continue;
        }
        return [];
      }
      const data = await response.json();
      return (data.items ?? []).map((item) => {
        const info = item.volumeInfo ?? {};
        return {
          id: item.id,
          workKey: null,
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
    } catch {
      if (attempt < 3) {
        await sleep(400 * 2 ** attempt);
        continue;
      }
      return [];
    }
  }
  return [];
}

async function fetchOpenLibraryBooks(q) {
  try {
    const fields = "key,title,author_name,first_publish_year,number_of_pages_median,cover_i,isbn";
    const response = await fetch(
      `${OPENLIBRARY_API}/search.json?q=${encodeURIComponent(q)}&limit=15&fields=${fields}`
    );
    if (!response.ok) {
      console.error(`[books/search] Open Library ${response.status} para "${q}"`);
      return [];
    }
    const data = await response.json();
    return (data.docs ?? [])
      .filter((d) => d.title && d.key)
      .map((d) => ({
        id: d.key.replace("/works/", ""),
        workKey: d.key,
        title: d.title,
        author: d.author_name?.[0] ?? "Autor desconocido",
        year: d.first_publish_year ?? null,
        pages: parseInt(String(d.number_of_pages_median ?? ""), 10) || null,
        cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
        isbn: d.isbn?.[0] ?? null,
        description: null,
        genre: null,
      }));
  } catch {
    return [];
  }
}

// GET /books/search?q=mistborn — busca en Google Books y Open Library, une y deduplica
router.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) throw httpError(400, "Query requerida");

  const normalizedQ = q.toLowerCase();
  const cacheKey = `books:search:${normalizedQ}`;
  const cachedSearch = cache.get(cacheKey);
  if (cachedSearch) return res.json(cachedSearch);

  let [googleBooks, openLibraryBooks] = await Promise.all([
    fetchGoogleBooks(q),
    fetchOpenLibraryBooks(q),
  ]);

  // Segunda ronda si ambas fuentes vinieron vacías: los fallos de Google
  // desde datacenter son intermitentes y un reintento tardío suele bastar.
  if (googleBooks.length === 0 && openLibraryBooks.length === 0) {
    await sleep(700);
    [googleBooks, openLibraryBooks] = await Promise.all([
      fetchGoogleBooks(q),
      fetchOpenLibraryBooks(q),
    ]);
  }

  // Prioriza Google (trae descripción y género) y descarta duplicados por título+autor
  const byKey = new Map();
  for (const book of [...googleBooks, ...openLibraryBooks]) {
    const key = `${normKey(book.title)}|${normKey(book.author)}`;
    if (!byKey.has(key)) byKey.set(key, { ...book, google_id: book.id });
  }
  const books = [...byKey.values()];

  await Promise.all(
    books.map((book) =>
      pool.query(
        `INSERT INTO books (google_id, title, author, cover, pages, year, isbn, description, genre)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (google_id) DO NOTHING`,
        [book.id, book.title, book.author, book.cover,
         book.pages, book.year ? String(book.year) : null, book.isbn, book.description, book.genre]
      ).catch(() => {})
    )
  );

  const result = { source: "mixed", books };
  // No cachea resultados vacíos: si Google falló intermitente, el próximo
  // intento del usuario debe volver a consultar las fuentes.
  if (books.length > 0) cache.set(cacheKey, result, 600000);
  res.json(result);
});

// GET /books/:id
router.get("/:id", async (req, res) => {
  const { rows } = await pool.query("SELECT * FROM books WHERE id = $1", [req.params.id]);
  if (rows.length === 0) throw httpError(404, "Libro no encontrado");
  res.json(rows[0]);
});

const EDITABLE_FIELDS = {
  title: { type: "string", max: 500 },
  author: { type: "string", max: 300 },
  cover: { type: "string", max: 1000 },
  pages: { type: "integer", min: 1 },
  year: { type: "integer", min: 1, max: 2100 },
  isbn: { type: "string", max: 50 },
  description: { type: "string", max: 5000 },
  genre: { type: "string", max: 100 },
  publisher: { type: "string", max: 120 },
  book_type: { type: "string", enum: ["physical", "ebook", "audio"] },
};

// PATCH /books/:id — edición global de la ficha. Campo lleno lo actualiza,
// campo vacío lo limpia (NULL); title no puede quedar vacío (columna NOT NULL).
router.patch("/:id", authMiddleware, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) throw httpError(404, "Libro no encontrado");

  const data = validate(req.body, EDITABLE_FIELDS);

  const sets = [];
  const values = [];
  for (const field of Object.keys(EDITABLE_FIELDS)) {
    if (!(field in req.body)) continue; // ausente => se conserva el valor actual
    const clean = data[field]; // falsy si el campo se envió vacío o solo espacios
    if (field === "title" && !clean) {
      throw httpError(400, "El título no puede quedar vacío");
    }
    values.push(field === "year" && clean ? String(clean) : (clean || null));
    sets.push(`${field} = $${values.length}`);
  }
  if (sets.length === 0) throw httpError(400, "Sin campos para actualizar");

  const { rows } = await pool.query(
    `UPDATE books SET ${sets.join(", ")} WHERE id = $${values.length + 1} RETURNING *`,
    [...values, req.params.id]
  );
  if (rows.length === 0) throw httpError(404, "Libro no encontrado");

  // La ficha viaja dentro de las respuestas cacheadas de todos los usuarios
  cache.delPrefix("user-books:");
  cache.delPrefix("books:search:");
  cache.delPrefix("calendar:");

  res.json(rows[0]);
});

// PATCH /books/:google_id/pages — acepta google_id o el id numérico de BD
// (los libros manuales no tienen google_id).
router.patch("/:google_id/pages", async (req, res) => {
  const data = validate(req.body, { pages: { required: true, type: "integer", min: 1 } });

  const param = req.params.google_id;
  const isDbId = /^\d+$/.test(param);
  const { rows } = await pool.query(
    `UPDATE books SET pages = $1
     WHERE google_id = $2 OR ($3::int IS NOT NULL AND id = $3::int)
     RETURNING *`,
    [data.pages, param, isDbId ? param : null]
  );
  if (rows.length === 0) throw httpError(404, "Libro no encontrado");
  res.json(rows[0]);
});

module.exports = router;