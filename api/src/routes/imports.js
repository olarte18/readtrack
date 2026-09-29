const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const { importLimiter } = require("../middleware/rateLimit");
const { validate } = require("../utils/validators");
const httpError = require("../utils/httpError");
const cache = require("../utils/cache");
const { buildImport } = require("../utils/csvImport");
const { parseBookmory } = require("../utils/bookmory");
const { buildPlan } = require("../utils/bookmoryImport");
const { applyPlan } = require("../utils/applyPlan");

router.use(authMiddleware);
router.use(importLimiter);

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
  const startedAtMs = Date.now();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await applyPlan(client, req.userId, plan);
    await client.query("COMMIT");
    invalidateUserData(req.userId);
    console.log(
      `[import/bookmory] usuario ${req.userId}: ${result.imported} libros, ` +
      `${result.sessions} sesiones, ${result.notes} notas en ${Date.now() - startedAtMs}ms`
    );

    res.json({
      imported: result.imported,
      booksCreated: result.booksCreated,
      booksMerged: result.booksMerged,
      sessions: result.sessions,
      notes: result.notes,
      categories: result.categories,
      cycles: result.cycles,
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

// POST /import/readtrack — restaura un respaldo de ReadTrack (formato del
// GET /export, o sea el mismo "plan" que aplica el import de Bookmory).
router.post("/readtrack", async (req, res) => {
  const plan = req.body?.plan;
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.books)) {
    throw httpError(400, "Respaldo inválido: falta la lista de libros");
  }
  if (plan.books.length > 5000) {
    throw httpError(400, "El respaldo supera el límite de 5000 libros");
  }
  const startedAtMs = Date.now();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await applyPlan(client, req.userId, plan);
    await client.query("COMMIT");
    invalidateUserData(req.userId);
    console.log(
      `[import/readtrack] usuario ${req.userId}: ${result.imported} libros, ` +
      `${result.sessions} sesiones, ${result.notes} notas en ${Date.now() - startedAtMs}ms`
    );
    res.json(result);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});

module.exports = router;