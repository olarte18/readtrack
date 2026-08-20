const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const { validate } = require("../utils/validators");
const { buildImport } = require("../utils/csvImport");

router.use(authMiddleware);

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

module.exports = router;