const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const { validate } = require("../utils/validators");
const cache = require("../utils/cache");
const { buildImport } = require("../utils/csvImport");
const { parseBookmory } = require("../utils/bookmory");
const { buildPlan, normPair, pgTs } = require("../utils/bookmoryImport");

router.use(authMiddleware);

function invalidateUserData(userId) {
  for (const prefix of ["user-books", "stats", "goals", "calendar"]) {
    cache.delPrefix(`${prefix}:${userId}`);
  }
}

// POST /import/preview
router.post("/preview", async (req, res) => {
  const data = validate(req.body, { csv: { required: true, type: "string", max: 10_000_000 } });
  const { format, rows, headers } = buildImport(data.csv);
  res.json({
    format,
    columns: headers,
    total: rows.length,
    rows: rows.slice(0, 50),
  });
});

// POST /import
router.post("/", async (req, res) => {
  const data = validate(req.body, { csv: { required: true, type: "string", max: 10_000_000 } });
  const { rows, idx } = buildImport(data.csv);

  let imported = 0;
  let skipped = 0;
  let already = 0;
  const errors = [];
  const seen = new Set();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    for (const row of rows) {
      if (!row.title) {
        errors.push({ title: "(sin título)", reason: "Fila sin título" });
        continue;
      }
      if (seen.has(row.google_id)) {
        skipped++;
        continue;
      }
      seen.add(row.google_id);

      const bookQ = await client.query("SELECT id FROM books WHERE google_id = $1", [row.google_id]);
      let book_id;
      if (bookQ.rows.length > 0) {
        book_id = bookQ.rows[0].id;
      } else {
        await client.query(
          `INSERT INTO books (google_id, title, author, cover, pages, year, isbn, genre)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [row.google_id, row.title, row.author, row.cover, row.pages, row.year, row.isbn, row.genre]
        );
        const inserted = await client.query("SELECT id FROM books WHERE google_id = $1", [row.google_id]);
        book_id = inserted.rows[0].id;
      }

      const owns = await client.query(
        "SELECT 1 FROM user_books WHERE book_id = $1 AND user_id = $2",
        [book_id, req.userId]
      );
      if (owns.rows.length > 0) {
        already++;
        continue;
      }

      await client.query(
        `INSERT INTO user_books (book_id, user_id, status, current_page, rating, started_at, finished_at, review)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [book_id, req.userId, row.status, row.current_page, row.rating, row.started_at, row.finished_at, row.review]
      );
      imported++;
    }

    await client.query("COMMIT");
    invalidateUserData(req.userId);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  res.json({
    imported,
    skipped,
    already,
    errors: errors.slice(0, 20),
    total: rows.length,
    columns: idx,
  });
});

// POST /import/bookmory/preview — analiza el archivo sin escribir nada
router.post("/bookmory/preview", async (req, res) => {
  const data = validate(req.body, { file_base64: { required: true, type: "string", max: 20_000_000 } });
  const parsed = await parseBookmory(Buffer.from(data.file_base64, "base64"));
  const plan = buildPlan(parsed);

  const sessionDays = new Set();
  let sessions = 0;
  let totalMinutes = 0;
  for (const book of plan.books) {
    sessions += book.sessionDays.length;
    for (const s of book.sessionDays) {
      sessionDays.add(s.day);
      totalMinutes += Math.round((s.durationSec ?? 0) / 60);
    }
  }

  res.json({
    totalBooks: plan.books.length,
    byStatus: plan.books.reduce((acc, b) => ({ ...acc, [b.status]: (acc[b.status] ?? 0) + 1 }), {}),
    sessions,
    activityDays: sessionDays.size,
    readingMinutes: totalMinutes,
    notes: plan.notes.length,
    categories: new Set(plan.books.flatMap((b) => b.categories.map((c) => c.name))).size,
    cycles: plan.books.reduce((a, b) => a + b.cycles.length, 0),
    yearlyGoals: plan.yearlyGoals,
    dailyMinutes: plan.dailyMinutes,
    sample: plan.books.slice(0, 8).map((b) => ({
      title: b.title,
      author: b.author,
      status: b.status,
      pages: b.pages,
      currentPage: b.currentPage,
      rating: b.rating,
      publisher: b.publisher,
      bookType: b.bookType,
      categories: b.categories.map((c) => `${c.isPrimary ? "★" : ""}${c.name}`),
      days: b.sessionDays.length,
    })),
  });
});

// POST /import/bookmory — importa todo dentro de una transacción
router.post("/bookmory", async (req, res) => {
  const data = validate(req.body, { file_base64: { required: true, type: "string", max: 20_000_000 } });
  const parsed = await parseBookmory(Buffer.from(data.file_base64, "base64"));
  const plan = buildPlan(parsed);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Mapa de libros existentes por título+autor para reutilizarlos en vez de duplicar
    const { rows: allBooks } = await client.query("SELECT id, title, author FROM books");
    const byPair = new Map();
    for (const row of allBooks) {
      byPair.set(normPair(row.title, row.author), { id: row.id });
    }

    // user_books del usuario con su book_id, para fusionar historial
    const { rows: owned } = await client.query(
      "SELECT id, book_id FROM user_books WHERE user_id = $1",
      [req.userId]
    );
    const ownedByBookId = new Map(owned.map((o) => [o.book_id, o.id]));

    let booksCreated = 0;
    let booksMerged = 0;
    let sessionsCreated = 0;
    let notesCreated = 0;
    let categoriesCreated = 0;
    let cyclesCreated = 0;

    for (const book of plan.books) {
      if (!book.title) continue;

      let bookId;
      const existing = byPair.get(normPair(book.title, book.author));
      if (existing) {
        bookId = existing.id;
        // Los datos de Bookmory ganan cuando existen; se conservan los actuales si no
        await client.query(
          `UPDATE books SET
             cover = COALESCE($1, cover),
             description = COALESCE($2, description),
             pages = COALESCE($3, pages),
             publisher = COALESCE($4, publisher),
             book_type = COALESCE($5, book_type)
           WHERE id = $6`,
          [book.cover, book.description, book.pages, book.publisher, book.bookType, bookId]
        );
        booksMerged++;
      } else {
        const inserted = await client.query(
          `INSERT INTO books (google_id, title, author, cover, pages, year, isbn, description, genre, publisher, book_type)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
          [book.googleId, book.title, book.author, book.cover, book.pages, book.year,
           book.isbn, book.description, null, book.publisher, book.bookType]
        );
        bookId = inserted.rows[0].id;
        byPair.set(normPair(book.title, book.author), { id: bookId });
        booksCreated++;
      }

      // Categorías: máx 3, la primera es la principal
      await client.query("DELETE FROM book_categories WHERE book_id = $1", [bookId]);
      for (let i = 0; i < book.categories.length; i++) {
        await client.query(
          "INSERT INTO book_categories (book_id, name, is_primary, position) VALUES ($1,$2,$3,$4)",
          [bookId, book.categories[i].name, book.categories[i].isPrimary, i]
        );
        categoriesCreated++;
      }

      // Fusionar con entrada existente o crearla; Bookmory manda como fuente de verdad
      let userBookId = ownedByBookId.get(bookId);
      if (userBookId) {
        await client.query(
          `UPDATE user_books SET status = $1, current_page = $2,
             rating = COALESCE($3, rating),
             started_at = COALESCE($4, started_at),
             finished_at = COALESCE($5, finished_at),
             review = COALESCE($6, review)
           WHERE id = $7`,
          [book.status, book.currentPage, book.rating, book.startedAt, book.finishedAt, book.review, userBookId]
        );
      } else {
        const inserted = await client.query(
          `INSERT INTO user_books (book_id, user_id, status, current_page, rating, started_at, finished_at, review)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [bookId, req.userId, book.status, book.currentPage, book.rating,
           book.startedAt, book.finishedAt, book.review]
        );
        userBookId = inserted.rows[0].id;
        ownedByBookId.set(bookId, userBookId);
      }

      // Ciclos de relectura (nth >= 2); se reemplazan para que reimportar no duplique
      await client.query("DELETE FROM reading_cycles WHERE user_book_id = $1", [userBookId]);
      for (const cycle of book.cycles) {
        await client.query(
          `INSERT INTO reading_cycles (user_book_id, nth, started_at, finished_at, rating, review)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [userBookId, cycle.nth, cycle.startedAt, cycle.finishedAt, cycle.rating, cycle.review]
        );
        cyclesCreated++;
      }

      // Sesiones: se deduplican por (fecha, duración, páginas) para que
      // reimportar no duplique y las sesiones reales del usuario queden intactas.
      const { rows: existingSessions } = await client.query(
        `SELECT TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS ts,
                COALESCE(duration_seconds, -1) AS dur,
                COALESCE(pages_read, -1) AS pages
         FROM reading_sessions WHERE user_book_id = $1`,
        [userBookId]
      );
      const existingKeys = new Set(
        existingSessions.map((r) => `${r.ts}|${r.dur}|${r.pages}`)
      );

      for (const day of book.sessionDays) {
        const key = `${pgTs(day.createdAtMs).replace(" ", "T")}|${day.durationSec ?? -1}|${day.pagesRead}`;
        if (existingKeys.has(key)) continue;
        await client.query(
          `INSERT INTO reading_sessions (user_book_id, user_id, page, duration_seconds, pages_read, created_at)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [userBookId, req.userId, book.currentPage, day.durationSec, day.pagesRead, pgTs(day.createdAtMs)]
        );
        sessionsCreated++;
      }
    }

    // Notas vinculadas al libro correspondiente
    const bidToBookId = new Map(plan.books.map((b) => [b.bid, byPair.get(normPair(b.title, b.author))?.id]));
    for (const note of plan.notes) {
      const bookId = bidToBookId.get(note.bid);
      if (!bookId) continue;
      await client.query(
        `INSERT INTO notes (book_id, user_id, content, page, created_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [bookId, req.userId, note.content, note.page, note.createdAtMs ? pgTs(note.createdAtMs) : null]
      );
      notesCreated++;
    }

    // Metas anuales de libros y meta diaria de minutos
    for (const goal of plan.yearlyGoals) {
      await client.query(
        `INSERT INTO reading_goals (user_id, type, metric, value, year)
         VALUES ($1,'annual','books',$2,$3)
         ON CONFLICT (user_id, type, year) DO UPDATE SET metric = 'books', value = EXCLUDED.value`,
        [req.userId, goal.value, goal.year]
      );
    }
    if (plan.dailyMinutes > 0) {
      const currentYear = new Date().getFullYear();
      await client.query(
        `INSERT INTO reading_goals (user_id, type, metric, value, year)
         VALUES ($1,'daily','minutes',$2,$3)
         ON CONFLICT (user_id, type, year) DO UPDATE SET metric = 'minutes', value = EXCLUDED.value`,
        [req.userId, plan.dailyMinutes, currentYear]
      );
    }

    await client.query("COMMIT");
    invalidateUserData(req.userId);

    res.json({
      imported: booksCreated + booksMerged,
      booksCreated,
      booksMerged,
      sessions: sessionsCreated,
      notes: notesCreated,
      categories: categoriesCreated,
      cycles: cyclesCreated,
      yearlyGoals: plan.yearlyGoals.length,
      dailyMinutes: plan.dailyMinutes ?? 0,
    });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

module.exports = router;