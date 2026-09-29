const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const { globalUserLimiter } = require("../middleware/rateLimit");

router.use(authMiddleware);
router.use(globalUserLimiter);

const isoDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

// GET /export — respaldo completo del usuario en el formato del "plan" que
// entiende el importador (POST /import/readtrack y POST /import/bookmory),
// para que exportar y restaurar sea un round-trip fiel:
// libros + biblioteca (incluye archivados), categorías, ciclos, sesiones
// (con client_id/started_at/page/start_page), notas y metas.
router.get("/", async (req, res) => {
  const [libraryRows, sessionRows, cycleRows, noteRows, goalRows] = await Promise.all([
    pool.query(
      `SELECT ub.id AS ubid,
              ub.status, ub.current_page, ub.rating, ub.started_at, ub.finished_at,
              ub.review, ub.reading_mode, ub.is_archived,
              ROUND(EXTRACT(EPOCH FROM ub.created_at) * 1000)::bigint AS created_ms,
              b.id AS db_id, b.google_id, b.title, b.author, b.cover, b.pages,
              b.chapters, b.year, b.genre, b.isbn, b.description, b.publisher, b.book_type,
              (SELECT json_agg(json_build_object('name', bc.name, 'is_primary', bc.is_primary) ORDER BY bc.position)
               FROM book_categories bc WHERE bc.book_id = b.id) AS categories
       FROM user_books ub
       JOIN books b ON ub.book_id = b.id
       WHERE ub.user_id = $1
       ORDER BY ub.id`,
      [req.userId]
    ),
    pool.query(
      `SELECT rs.user_book_id AS ubid,
              ROUND(EXTRACT(EPOCH FROM rs.created_at) * 1000)::bigint AS created_ms,
              ROUND(EXTRACT(EPOCH FROM rs.started_at) * 1000)::bigint AS start_ms,
              rs.duration_seconds AS duration_sec, rs.pages_read AS pages_read,
              rs.page, rs.start_page, rs.client_id
       FROM reading_sessions rs WHERE rs.user_id = $1
       ORDER BY rs.created_at`,
      [req.userId]
    ),
    pool.query(
      `SELECT rc.user_book_id AS ubid, rc.nth, rc.started_at, rc.finished_at,
              rc.rating, rc.review
       FROM reading_cycles rc
       JOIN user_books ub ON ub.id = rc.user_book_id
       WHERE ub.user_id = $1
       ORDER BY rc.user_book_id, rc.nth`,
      [req.userId]
    ),
    pool.query(
      `SELECT n.book_id, n.user_book_id, n.content, n.page,
              ROUND(EXTRACT(EPOCH FROM n.created_at) * 1000)::bigint AS created_ms
       FROM notes n WHERE n.user_id = $1
       ORDER BY n.created_at`,
      [req.userId]
    ),
    pool.query(
      "SELECT type, metric, value, year FROM reading_goals WHERE user_id = $1 ORDER BY type, year",
      [req.userId]
    ),
  ]);

  const books = [];
  const ubidToBid = new Map();
  const bidByBookId = new Map();
  for (const b of libraryRows.rows) {
    const bid = `u${b.ubid}`;
    ubidToBid.set(b.ubid, bid);
    if (!bidByBookId.has(b.db_id)) bidByBookId.set(b.db_id, bid);
    books.push({
      bid,
      googleId: b.google_id,
      title: b.title,
      author: b.author,
      cover: b.cover,
      pages: b.pages,
      chapters: b.chapters,
      year: b.year ? String(b.year).slice(0, 4) : null,
      isbn: b.isbn,
      description: b.description,
      publisher: b.publisher,
      bookType: b.book_type,
      status: b.status,
      currentPage: b.current_page ?? 0,
      rating: b.rating,
      startedAt: isoDate(b.started_at),
      finishedAt: isoDate(b.finished_at),
      review: b.review,
      readingMode: b.reading_mode,
      isArchived: b.is_archived,
      createdAtMs: b.created_ms != null ? Number(b.created_ms) : null,
      categories: (b.categories ?? []).map((c) => ({ name: c.name, isPrimary: c.is_primary })),
      cycles: [],
      sessionDays: [],
    });
  }

  const sessionsByUbid = new Map();
  for (const s of sessionRows.rows) {
    const ubid = Number(s.ubid);
    if (!sessionsByUbid.has(ubid)) sessionsByUbid.set(ubid, []);
    sessionsByUbid.get(ubid).push({
      createdAtMs: s.created_ms != null ? Number(s.created_ms) : null,
      startMs: s.start_ms != null ? Number(s.start_ms) : null,
      durationSec: s.duration_sec,
      pagesRead: s.pages_read,
      page: s.page,
      startPage: s.start_page,
      clientId: s.client_id,
    });
  }
  const cyclesByUbid = new Map();
  for (const c of cycleRows.rows) {
    const ubid = Number(c.ubid);
    if (!cyclesByUbid.has(ubid)) cyclesByUbid.set(ubid, []);
    cyclesByUbid.get(ubid).push({
      nth: c.nth,
      startedAt: isoDate(c.started_at),
      finishedAt: isoDate(c.finished_at),
      rating: c.rating,
      review: c.review,
    });
  }

  for (const book of books) {
    const ubid = Number(book.bid.slice(1));
    book.sessionDays = sessionsByUbid.get(ubid) ?? [];
    book.cycles = cyclesByUbid.get(ubid) ?? [];
  }

  const notes = [];
  for (const n of noteRows.rows) {
    const bid =
      (n.user_book_id && ubidToBid.get(n.user_book_id)) ||
      bidByBookId.get(n.book_id);
    if (!bid) continue;
    notes.push({ bid, content: n.content, page: n.page, createdAtMs: n.created_ms != null ? Number(n.created_ms) : null });
  }

  res.json({
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    books,
    notes,
    goals: goalRows.rows.map((g) => ({
      type: g.type,
      metric: g.metric,
      value: g.value,
      year: g.year,
    })),
  });
});

module.exports = router;