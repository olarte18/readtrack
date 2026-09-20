const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const httpError = require("../utils/httpError");
const { validate } = require("../utils/validators");
const cache = require("../utils/cache");
const authMiddleware = require("../middleware/auth");
const { makeLimiter } = require("../middleware/rateLimit");
const { uploadCover, isConfigured } = require("../utils/coverStorage");

// Portadas subidas: payloads de ~7MB base64, raro por usuario. Límite estricto
// por usuario (no IP) para no dejar subir portadas de cientos de libros a un
// solo usuario. Debe ir DESPUÉS del authMiddleware.
const coverUploadLimiter = makeLimiter({
  max: 30,
  windowMs: process.env.RATE_LIMIT_WINDOW_MS,
  keyBy: "userId",
});

const GOOGLE_API = "https://www.googleapis.com/books/v1";
const OPENLIBRARY_API = "https://openlibrary.org";

const normKey = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Mapa para borrar acentos en SQL sin extensión unaccent (translate).
const ACCENTS_FROM = "áàâäãåéèêëíìîïóòôöõúùûüñç";
const ACCENTS_TO = "aaaaaaeeeeiiiiooooouuuunc";

// Función de relevancia de un libro del catálogo local contra la query.
function catalogScore(row, q, np) {
  const nt = normKey(row.title);
  const na = normKey(row.author);
  if (row.isbn && row.isbn === q) return 95;
  if (row.google_id && row.google_id === q) return 95;
  if (nt === np) return 100;
  if (nt.startsWith(np)) return 80;
  if (nt.includes(np)) return 60;
  if (na.includes(np)) return 40;
  return 0;
}

// Busca en el catálogo local (prioridad #1): coincidencia de frase en título o
// autor (insensible a acentos y mayúsculas), isbn/google_id exactos. Ordena por
// relevancia y luego por popularidad = nº de copias en bibliotecas (user_books).
async function searchCatalog(q) {
  const np = normKey(q);
  if (!np) return [];
  const { rows } = await pool.query(
    `WITH pop AS (
       SELECT ub.book_id AS id, COUNT(*) AS copies
       FROM user_books ub
       GROUP BY ub.book_id
     )
     SELECT b.*, COALESCE(pop.copies, 0) AS popularity
     FROM books b
     LEFT JOIN pop ON pop.id = b.id
     WHERE b.isbn = $1 OR b.google_id = $1
        OR regexp_replace(translate(lower(b.title), $2, $3), '[^a-z0-9]', '', 'g') LIKE '%' || $4 || '%'
        OR regexp_replace(translate(lower(b.author), $2, $3), '[^a-z0-9]', '', 'g') LIKE '%' || $4 || '%'
     LIMIT 150`,
    [q, ACCENTS_FROM, ACCENTS_TO, np]
  );
  return rows
    .map((row) => ({ row, score: catalogScore(row, q, np) }))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        (b.row.popularity ?? 0) - (a.row.popularity ?? 0) ||
        (a.row.cover ? 0 : 1) - (b.row.cover ? 0 : 1) ||
        b.row.id - a.row.id
    )
    .slice(0, 10)
    .map(({ row }) => {
      const id = row.google_id || `db-${row.id}`;
      return {
        id,
        google_id: row.google_id || id,
        db_id: row.id,
        source: "db",
        title: row.title,
        author: row.author ?? "Autor desconocido",
        year: row.year ?? null,
        pages: row.pages ?? null,
        chapters: row.chapters ?? null,
        cover: row.cover ?? null,
        isbn: row.isbn ?? null,
        description: row.description ?? null,
        genre: row.genre ?? null,
        publisher: row.publisher ?? null,
        book_type: row.book_type ?? null,
      };
    });
}

// Tokens de búsqueda: palabras de ≥3 letras sin acentos.
const tokenize = (np) => np.split(/\s+/).filter((t) => t.length >= 3);

// Filtro suave de relevancia: el libro se descarta solo si NINGÚN token de la
// query aparece en su título o autor. Descartar "Leer o morir" para
// "ensayo sobre la lucidez" pero conservar "Guía para leer a José Saramago".
// Una query solo numérica (ISBN) no aplica el filtro.
function matchesTokens(title, author, isbn, q, np) {
  const tokens = tokenize(np);
  if (tokens.length === 0) return true;
  if (/^\d{9,}$/.test(np)) return true;
  if (isbn && normKey(isbn) === normKey(q)) return true;
  const hay = `${normKey(title)} ${normKey(author)}`;
  return tokens.some((t) => hay.includes(t));
}

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
    const fields = "key,title,author_name,first_publish_year,number_of_pages_median,cover_i,isbn,edition_count";
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
        edition_count: d.edition_count ?? null,
      }));
  } catch {
    return [];
  }
}

// GET /books/search?q=mistborn — búsqueda en tres capas: catálogo local
// (prioridad #1, ordenado por relevancia y popularidad), Google Books y
// Open Library como relleno. Orden final: BD > Google > OL.
router.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) throw httpError(400, "Query requerida");

  const normalizedQ = q.toLowerCase();
  const cacheKey = `books:search:${normalizedQ}`;
  const cachedSearch = cache.get(cacheKey);
  if (cachedSearch) return res.json(cachedSearch);

  const np = normKey(q);

  let [dbBooks, googleBooks, openLibraryBooks] = await Promise.all([
    searchCatalog(q),
    fetchGoogleBooks(q),
    fetchOpenLibraryBooks(q),
  ]);

  // Segunda ronda si las fuentes externas vinieron vacías: los fallos de Google
  // desde datacenter son intermitentes y un reintento tardío suele bastar.
  if (googleBooks.length === 0 && openLibraryBooks.length === 0) {
    await sleep(700);
    [googleBooks, openLibraryBooks] = await Promise.all([
      fetchGoogleBooks(q),
      fetchOpenLibraryBooks(q),
    ]);
  }

  // Filtro de relevancia sobre lo externo: solo conserva lo que comparte algún
  // token con la query (mata el ruido tipo "Leer o morir").
  const googleFiltered = googleBooks.filter((b) =>
    matchesTokens(b.title, b.author, b.isbn, q, np)
  );
  // Open Library solo como relleno: ordenado por edition_count (popularidad).
  const openLibraryFiltered = openLibraryBooks
    .filter((b) => matchesTokens(b.title, b.author, b.isbn, q, np))
    .sort((a, b) => (b.edition_count ?? 0) - (a.edition_count ?? 0));

  // Merge con dedup: la BD gana siempre (título+autor o google_id).
  const books = [];
  const seen = new Map();
  const addUnique = (book, source) => {
    const candidate = { ...book, source };
    const gkey = "g:" + (candidate.google_id || candidate.id);
    const tkey = "t:" + `${normKey(candidate.title)}|${normKey(candidate.author)}`;
    if (seen.has(gkey) || seen.has(tkey)) return;
    seen.set(gkey, true);
    seen.set(tkey, true);
    books.push(candidate);
  };
  for (const b of dbBooks) addUnique(b, "db");

  for (const b of googleFiltered) {
    if (books.length >= 12) break;
    addUnique(b, "google");
  }

  // La OL es la fuente del ruido: se omite cuando ya hay buenas coincidencias
  // locales (≥3) y solo completa hasta el tope.
  if (dbBooks.length < 3) {
    for (const b of openLibraryFiltered) {
      if (books.length >= 12) break;
      addUnique(b, "openlibrary");
    }
  }

  await Promise.all(
    [...googleFiltered, ...openLibraryFiltered].map((book) =>
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
  chapters: { type: "integer", min: 1 },
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

// POST /books/:id/cover — el usuario sube una portada. El API sube la imagen a
// Supabase Storage (service-role) y guarda la URL pública en books.cover, que
// es TEXT: no hay cambios de schema ni conflicto con la BD.
router.post("/:id/cover", authMiddleware, coverUploadLimiter, async (req, res) => {
  if (!/^\d+$/.test(req.params.id)) throw httpError(404, "Libro no encontrado");
  if (!isConfigured()) throw httpError(503, "Servicio de portadas no configurado");

  const exists = await pool.query("SELECT 1 FROM books WHERE id = $1", [req.params.id]);
  if (exists.rows.length === 0) throw httpError(404, "Libro no encontrado");

  const raw = req.body?.image;
  if (typeof raw !== "string" || !raw.trim()) throw httpError(400, "Imagen es requerida");
  // Acepta data URL (data:image/jpeg;base64,...) o base64 crudo.
  const base64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
  if (base64.length > 8 * 1024 * 1024) throw httpError(413, "La imagen supera 5 MB");

  const cover = await uploadCover(Buffer.from(base64, "base64"), req.params.id);
  if (cover.length > 1000) throw httpError(500, "No se pudo guardar la portada");

  const { rows } = await pool.query(
    "UPDATE books SET cover = $1 WHERE id = $2 RETURNING id, cover",
    [cover, req.params.id]
  );
  cache.delPrefix("user-books:");
  cache.delPrefix("books:search:");
  cache.delPrefix("calendar:");

  res.json(rows[0]);
});

// PATCH /books/:google_id/pages — acepta google_id o el id numérico de BD
// (los libros manuales no tienen google_id).
router.patch("/:google_id/pages", authMiddleware, async (req, res) => {
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