const crypto = require("crypto");
const { parseCSV } = require("./csv");
const httpError = require("./httpError");

const MAX_ROWS = 5000;

const normalize = (value) =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const FIELD_ALIASES = {
  title: ["book title", "title", "titulo", "name", "book name", "nombre"],
  author: ["author", "authors", "author l-f", "autor", "autores", "writer", "escritor"],
  pages: ["number of pages", "target pages", "page count", "total pages", "pages", "paginas", "num paginas", "pags"],
  readPages: ["pages read", "read pages", "paginas leidas", "current page", "pagina actual", "progress", "progreso"],
  year: ["year published", "original publication year", "publication year", "fecha de publicacion", "publicado en", "year", "año", "ano"],
  isbn: ["isbn13", "isbn 13", "isbn10", "isbn 10", "isbn"],
  cover: ["cover", "cover image", "book cover", "image", "imagen", "portada", "cover url"],
  rating: ["my rating", "rating", "calificacion", "valoracion", "estrellas", "stars", "my review rating"],
  status: ["exclusive shelf", "shelf", "bookshelf", "status", "estado"],
  review: ["my review", "my review description", "review", "mi resena", "resena"],
  notes: ["notes", "my notes", "note", "notas", "nota", "comments", "comment", "comentario", "comentarios"],
  genre: ["genre", "genero", "category", "categoria", "classifications", "classification"],
  dateRead: ["date read", "read date", "finished date", "date finished", "finished on", "terminado el", "finalizado el", "fecha de fin", "fecha fin", "leido el", "leído el"],
  dateAdded: ["date added", "added", "date started", "started date", "start date", "date began", "fecha de inicio", "fecha inicio", "iniciado el", "empezado el"],
};

const STATUS_RULES = {
  reading: ["currently-reading", "currently reading", "reading", "now reading", "in progress", "leyendo", "en lectura", "en curso", "en proceso"],
  wishlist: ["to-read", "to read", "want to read", "wishlist", "por leer", "quiero leer", "para leer", "lista de deseos", "deseos"],
  completed: ["read", "finished", "completed", "leido", "leida", "terminado", "terminada", "finalizado", "finalizada", "acabado", "acabada"],
};

function mapColumnIndexes(headers) {
  const slugs = headers.map(normalize);
  const idx = {};
  for (const field in FIELD_ALIASES) {
    idx[field] = -1;
    for (const alias of FIELD_ALIASES[field]) {
      const hit = slugs.indexOf(normalize(alias));
      if (hit !== -1) {
        idx[field] = hit;
        break;
      }
    }
  }
  return { idx, slugs };
}

function detectFormat(headers) {
  const lower = headers.map((h) => String(h || "").toLowerCase());
  if (lower.some((h) => h.includes("exclusive shelf"))) return "Goodreads";
  if (lower.some((h) => h === "status") || lower.some((h) => h.includes("target pages"))) return "Bookmory";
  return "Genérico";
}

const get = (row, i) => (i >= 0 ? String(row[i] ?? "").trim() : "");

const toInt = (value) => {
  const n = parseInt(String(value || "").replace(/[^0-9]/g, ""), 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

function parseDate(value, format) {
  const s = String(value || "").trim();
  if (!s) return null;
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(s)) {
    const m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    return m ? `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}` : null;
  }
  const m = s.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (!m) return null;
  let [, a, b, y] = m;
  let month = +a;
  let day = +b;
  if (format !== "Goodreads" && month <= 12) {
    month = +b;
    day = +a;
  }
  if (month > 12) {
    month = +b;
    day = +a;
  }
  if (month > 12 || day > 31) return null;
  return `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function mapStatus(value) {
  const s = normalize(value);
  if (!s) return "pending";
  for (const [status, keys] of Object.entries(STATUS_RULES)) {
    if (keys.some((k) => s.includes(k))) return status;
  }
  return "pending";
}

function mapRating(value) {
  const n = parseFloat(String(value || "").replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(1, Math.min(5, Math.round(n)));
}

function stripHtml(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYear(value) {
  const m = String(value || "").match(/(1[89]\d{2}|20\d{2})/);
  return m ? m[1] : null;
}

function makeGoogleId({ title, author, isbn }) {
  if (isbn) return `isbn-${isbn}`;
  const key = `${String(title).trim().slice(0, 200)}|${String(author).trim().slice(0, 100)}`;
  const hash = crypto.createHash("md5").update(key).digest("hex").slice(0, 16);
  return `csv-${hash}`;
}

function parseRow(row, idx, format) {
  const title = get(row, idx.title);
  const author = get(row, idx.author);
  const isbn = get(row, idx.isbn).replace(/[^0-9]/g, "").slice(0, 20);
  const pages = toInt(get(row, idx.pages));
  const readPages = toInt(get(row, idx.readPages));
  const year = extractYear(get(row, idx.year));
  const rating = mapRating(get(row, idx.rating));
  const status = mapStatus(get(row, idx.status));
  const genre = get(row, idx.genre).slice(0, 100) || null;
  const cover = get(row, idx.cover) || null;
  const review = stripHtml(
    `${get(row, idx.review)}${get(row, idx.notes) ? `\n\nNotas:\n${get(row, idx.notes)}` : ""}`
  ).slice(0, 10000) || null;
  const started_at = parseDate(get(row, idx.dateAdded), format);
  const finished_at = parseDate(get(row, idx.dateRead), format);

  let current_page = readPages;
  if (current_page !== null) {
    if (pages !== null && current_page > pages) current_page = pages;
  } else {
    current_page = 0;
  }

  return {
    title,
    author: author || null,
    isbn: isbn || null,
    pages,
    year,
    rating,
    status,
    genre,
    cover,
    review,
    started_at,
    finished_at,
    current_page,
    google_id: makeGoogleId({ title, author, isbn }),
  };
}

function buildImport(csvText) {
  const clean = String(csvText || "").replace(/^\uFEFF/, "").trim();
  if (!clean) throw httpError(400, "El archivo CSV está vacío");

  const table = parseCSV(clean).filter((r) => r.some((c) => String(c).trim() !== ""));
  if (table.length < 2) throw httpError(400, "El CSV necesita un encabezado y al menos una fila de libros");

  const headers = table[0];
  const { idx } = mapColumnIndexes(headers);
  const format = detectFormat(headers);

  if (idx.title === -1) throw httpError(400, "No se encontró una columna de Título en el CSV");

  const rows = table.slice(1).map((row) => parseRow(row, idx, format));
  if (rows.length > MAX_ROWS) {
    throw httpError(400, `El archivo supera el límite de ${MAX_ROWS} filas`);
  }

  return { format, rows, headers, idx };
}

module.exports = { buildImport, mapStatus, parseDate };