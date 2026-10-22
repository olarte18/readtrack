const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const httpError = require("../utils/httpError");
const { validate } = require("../utils/validators");
const cache = require("../utils/cache");
const { translateTitle } = require("../utils/translate");
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
const DISCOVERY_GENRES = {
  fantasy: { label: "Fantasía", subject: "fantasy" },
  fiction: { label: "Ficción", subject: "fiction" },
  mystery: { label: "Misterio", subject: "mystery" },
  romance: { label: "Romance", subject: "romance" },
  science_fiction: { label: "Ciencia ficción", subject: "science_fiction" },
  horror: { label: "Terror", subject: "horror" },
  history: { label: "Historia", subject: "history" },
  biography: { label: "Biografía", subject: "biography" },
};

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

const DISCOVERY_LIMIT = 20;
const RECOMMENDATION_LIMIT = 10;
const RECOMMENDATION_MIN_BOOKS = 3;
const OL_FIELDS_SPA =
  "key,title,author_name,first_publish_year,cover_i,edition_count,editions,editions.title,editions.language,editions.cover_i";
const OL_FIELDS_ALL = "key,title,author_name,first_publish_year,cover_i,edition_count";

// Nombres de categoría/género del catálogo (en español o inglés) → género de
// Descubrir. Se normalizan sin acentos/mayúsculas. El orden importa: lo
// específico va antes que lo genérico (p. ej. "ciencia ficción" antes de "ficción").
const GENRE_HINTS = [
  ["science_fiction", ["ciencia ficcion", "ciencia-ficcion", "science fiction", "sci-fi", "scifi", "sci fi", "distopia", "distop", "space opera"]],
  ["biography", ["biografia", "biography", "biografic", "memorias", "memoir", "autobiograf"]],
  ["horror", ["terror", "horror", "gotico", "gothic"]],
  ["mystery", ["misterio", "mystery", "policiac", "thriller", "suspenso", "suspense", "crimen", "crime", "detective"]],
  ["romance", ["romance", "romantic"]],
  ["fantasy", ["fantasia", "fantasy", "epica", "epic", "magia", "magic"]],
  ["history", ["historia", "history", "historico", "historical"]],
  ["fiction", ["ficcion", "fiction", "novela", "novel", "literaria", "literary"]],
].map(([key, hints]) => [key, hints.map(normKey)]);

function discoveryGenreKey(name) {
  const n = normKey(name);
  if (!n) return null;
  for (const [key, hints] of GENRE_HINTS) {
    if (hints.some((hint) => n.includes(hint))) return key;
  }
  return null;
}

const coverUrl = (id) => (id ? `https://covers.openlibrary.org/b/id/${id}-M.jpg` : null);

// La edición en español viene en el subobjeto editions (con language:spa en la query
// el servidor filtra por español). Devuelve la primera con título y portada.
function spanishEdition(doc) {
  const docs = doc?.editions?.docs;
  if (!Array.isArray(docs)) return null;
  return docs.find((ed) => Array.isArray(ed?.language) && ed.language.includes("spa") && ed?.title) ?? null;
}

// Obtiene (y cachea 1 h) los libros de un género de Descubrir. Prioriza obras con
// edición en español; a las que no la tienen les traduce el título como respaldo.
async function getDiscoveryPayload(genreKey) {
  const genre = DISCOVERY_GENRES[genreKey];
  const cacheKey = `books:discover:${genreKey}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const subject = encodeURIComponent(`subject:${genre.subject}`);
  const spaUrl = `${OPENLIBRARY_API}/search.json?q=${subject}%20language%3Aspa&sort=editions&limit=25&fields=${OL_FIELDS_SPA}`;
  const allUrl = `${OPENLIBRARY_API}/search.json?q=${subject}&sort=editions&limit=25&fields=${OL_FIELDS_ALL}`;

  let spaOk = false;
  let allOk = false;
  let spaDocs = [];
  let allDocs = [];
  try {
    const [spaRes, allRes] = await Promise.all([fetch(spaUrl), fetch(allUrl)]);
    spaOk = spaRes.ok;
    allOk = allRes.ok;
    if (spaOk) spaDocs = (await spaRes.json())?.docs ?? [];
    if (allOk) allDocs = (await allRes.json())?.docs ?? [];
  } catch {
    throw httpError(502, "No se pudo consultar el catálogo de libros");
  }
  if (!spaOk && !allOk) throw httpError(502, "No se pudo consultar el catálogo de libros");

  const byEditions = (docs) => [...docs].sort((a, b) => (b.edition_count ?? 0) - (a.edition_count ?? 0));
  const seen = new Set();
  const books = [];

  for (const doc of byEditions(spaDocs)) {
    if (books.length >= DISCOVERY_LIMIT) break;
    if (!doc?.key || !doc?.title || seen.has(doc.key)) continue;
    seen.add(doc.key);
    const ed = spanishEdition(doc);
    const title = ed?.title ?? doc.title;
    books.push({
      id: doc.key.split("/").pop(),
      workKey: doc.key,
      title, // edición en español: título real, es lo que se guarda
      display_title: title,
      original_title: doc.title,
      translated: false,
      author: doc.author_name?.[0] ?? "Autor desconocido",
      year: doc.first_publish_year ?? null,
      pages: null,
      cover: coverUrl(ed?.cover_i) ?? coverUrl(doc.cover_i),
      isbn: null,
      description: null,
      genre: genre.label,
      edition_count: Number(doc.edition_count) || 0,
      source: "openlibrary",
    });
  }

  // Relleno: obras sin edición en español. Se traduce el título para mostrarlo,
  // pero `title` conserva el original real (evita guardar títulos inventados).
  for (const doc of byEditions(allDocs)) {
    if (books.length >= DISCOVERY_LIMIT) break;
    if (!doc?.key || !doc?.title || seen.has(doc.key)) continue;
    seen.add(doc.key);
    const translated = await translateTitle(doc.title);
    books.push({
      id: doc.key.split("/").pop(),
      workKey: doc.key,
      title: doc.title,
      display_title: translated ?? doc.title,
      original_title: doc.title,
      translated: Boolean(translated),
      author: doc.author_name?.[0] ?? "Autor desconocido",
      year: doc.first_publish_year ?? null,
      pages: null,
      cover: coverUrl(doc.cover_i),
      isbn: null,
      description: null,
      genre: genre.label,
      edition_count: Number(doc.edition_count) || 0,
      source: "openlibrary",
    });
  }

  const payload = { genre: genre.label, popularity_basis: "edition_count", books };
  if (books.length) cache.set(cacheKey, payload, 3600000);
  return payload;
}

// GET /books/discover?genre=fantasy — selección general ordenada por ediciones
// registradas en Open Library (señal pública de popularidad, no de ReadTrack).
router.get("/discover", authMiddleware, async (req, res) => {
  const genreKey = String(req.query.genre ?? "");
  if (!DISCOVERY_GENRES[genreKey]) throw httpError(400, "Género no válido");
  res.json(await getDiscoveryPayload(genreKey));
});

// GET /books/recommendations — "Para ti": usa deseos y libros completados con
// 4-5 estrellas. Necesita al menos RECOMMENDATION_MIN_BOOKS libros con género
// identificable; si no, responde enabled=false y Descubrir sigue con la
// exploración general por género.
router.get("/recommendations", authMiddleware, async (req, res) => {
  const cacheKey = `books:recs:${req.userId}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const { rows: signalRows } = await pool.query(`
    SELECT ub.book_id, b.genre, b.title, b.author, b.google_id,
           ARRAY_REMOVE(ARRAY_AGG(DISTINCT NULLIF(BTRIM(bc.name), '')), NULL) AS categories
    FROM user_books ub
    JOIN books b ON b.id = ub.book_id
    LEFT JOIN book_categories bc ON bc.book_id = b.id
    WHERE ub.user_id = $1
      AND ub.is_archived = FALSE
      AND (ub.status = 'wishlist' OR (ub.status = 'completed' AND ub.rating >= 4))
    GROUP BY ub.book_id, b.genre, b.title, b.author, b.google_id
  `, [req.userId]);

  const counts = new Map();
  let signalBooks = 0;
  for (const row of signalRows) {
    const names = Array.isArray(row.categories) && row.categories.length ? row.categories : [row.genre];
    const keys = new Set();
    for (const name of names) {
      const key = discoveryGenreKey(name);
      if (key) keys.add(key);
    }
    if (!keys.size) continue;
    signalBooks += 1;
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const topGenres = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([key, books]) => ({ key, label: DISCOVERY_GENRES[key].label, books }));

  if (signalBooks < RECOMMENDATION_MIN_BOOKS) {
    const payload = {
      enabled: false,
      min_books: RECOMMENDATION_MIN_BOOKS,
      signal_books: signalBooks,
      genres: topGenres,
      books: [],
    };
    cache.set(cacheKey, payload, 60000);
    return res.json(payload);
  }

  // Libros que ya están en la biblioteca: se excluyen de las recomendaciones.
  const { rows: ownedRows } = await pool.query(`
    SELECT b.google_id, b.title
    FROM user_books ub
    JOIN books b ON b.id = ub.book_id
    WHERE ub.user_id = $1 AND ub.is_archived = FALSE
  `, [req.userId]);
  const ownedIds = new Set(ownedRows.map((r) => r.google_id).filter(Boolean));
  const ownedTitles = new Set(ownedRows.map((r) => normKey(r.title)).filter(Boolean));

  const lists = [];
  let catalogError = false;
  for (const genre of topGenres) {
    try {
      const payload = await getDiscoveryPayload(genre.key);
      lists.push({ genre, books: payload.books });
    } catch {
      catalogError = true;
    }
  }

  const books = [];
  const seen = new Set();
  const maxLen = lists.reduce((max, list) => Math.max(max, list.books.length), 0);
  for (let i = 0; i < maxLen && books.length < RECOMMENDATION_LIMIT; i += 1) {
    for (const { genre, books: genreBooks } of lists) {
      const book = genreBooks[i];
      if (!book) continue;
      const key = book.workKey ?? book.id;
      if (seen.has(key)) continue;
      if (ownedIds.has(book.id)) continue;
      if (ownedTitles.has(normKey(book.title)) || ownedTitles.has(normKey(book.display_title))) continue;
      seen.add(key);
      books.push({ ...book, reason: `Porque te interesa ${genre.label}` });
      if (books.length >= RECOMMENDATION_LIMIT) break;
    }
  }

  const payload = {
    enabled: true,
    min_books: RECOMMENDATION_MIN_BOOKS,
    signal_books: signalBooks,
    genres: topGenres,
    books,
    ...(catalogError && !books.length ? { catalog_error: true } : {}),
  };
  cache.set(cacheKey, payload, 60000);
  res.json(payload);
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
