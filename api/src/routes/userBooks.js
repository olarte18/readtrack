const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const { globalUserLimiter } = require("../middleware/rateLimit");
const httpError = require("../utils/httpError");
const { validate } = require("../utils/validators");
const cache = require("../utils/cache");
const { recheckAchievements, withFreshAchievements } = require("../utils/achievements");
const { appDay } = require("../utils/dates");

const STATUSES = ["pending", "reading", "paused", "completed", "wishlist", "abandoned"];

router.use(authMiddleware);
router.use(globalUserLimiter);

function invalidateUserData(userId) {
  cache.delPrefix(`user-books:${userId}`);
  cache.delPrefix(`stats:${userId}`);
  cache.delPrefix(`goals:${userId}`);
}

// GET /user-books
router.get("/", async (req, res) => {
  const cacheKey = `user-books:${req.userId}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const { rows } = await pool.query(`
    SELECT ub.id, ub.status, ub.current_page, ub.rating, ub.started_at, ub.finished_at, ub.review,
           ub.reading_mode, ub.created_at, ub.read_number,
           b.id AS db_id,
           b.title, b.author, b.cover, b.pages, b.chapters, b.year, b.genre, b.google_id, b.publisher, b.book_type,
           (
             SELECT json_agg(json_build_object('name', bc.name, 'is_primary', bc.is_primary) ORDER BY bc.position)
             FROM book_categories bc WHERE bc.book_id = b.id
           ) AS categories
    FROM user_books ub
    JOIN books b ON ub.book_id = b.id
    WHERE ub.user_id = $1
      AND ub.is_archived = FALSE
    ORDER BY ub.created_at DESC
  `, [req.userId]);
  cache.set(cacheKey, rows, 30000);
  res.json(rows);
});

// POST /user-books
router.post("/", async (req, res) => {
  const data = validate(req.body, {
    google_id: { type: "string", max: 100 },
    title: { required: true, type: "string", max: 500 },
    author: { type: "string", max: 300 },
    cover: { type: "string", max: 1000 },
    pages: { type: "integer", min: 1 },
    chapters: { type: "integer", min: 1 },
    year: { type: "integer", min: 1, max: 2100 },
    genre: { type: "string", max: 100 },
    isbn: { type: "string", max: 50 },
    description: { type: "string", max: 5000 },
    publisher: { type: "string", max: 120 },
    book_type: { type: "string", enum: ["physical", "ebook", "audio"] },
    reading_mode: { type: "string", enum: ["page", "chapter", "percentage"] },
    status: { type: "string", enum: STATUSES },
  });

  // Un libro manual (sin google_id) siempre es "nuevo": no hay conflicto posible.
  // Con google_id presente, ON CONFLICT evita duplicar; si no devuelve fila,
  // significa que el libro ya existía y hay que recuperar su id por google_id.
  const inserted = await pool.query(`
    INSERT INTO books (google_id, title, author, cover, pages, chapters, year, genre, isbn, description, publisher, book_type)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT (google_id) DO NOTHING
    RETURNING id
  `, [data.google_id, data.title, data.author, data.cover, data.pages, data.chapters,
       data.year ? String(data.year) : null, data.genre, data.isbn,
       data.description, data.publisher, data.book_type]);

  let book_id = inserted.rows[0]?.id;
  if (!book_id && data.google_id) {
    const { rows: bookRows } = await pool.query(
      "SELECT id FROM books WHERE google_id = $1", [data.google_id]
    );
    book_id = bookRows[0]?.id;
  }

  const { rows: numRows } = await pool.query(
    `SELECT COALESCE(MAX(read_number), 0) + 1 AS next
     FROM user_books WHERE book_id = $1 AND user_id = $2`,
    [book_id, req.userId]
  );

  const { rows } = await pool.query(`
    INSERT INTO user_books (book_id, user_id, status, reading_mode, read_number)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `, [book_id, req.userId, data.status ?? "pending", data.reading_mode ?? "page", numRows[0].next]);

  invalidateUserData(req.userId);
  res.status(201).json(rows[0]);
});

// PATCH /user-books/:id
router.patch("/:id", async (req, res) => {
  const data = validate(req.body, {
    status: { type: "string", enum: STATUSES },
    current_page: { type: "integer", min: 0 },
    rating: { type: "integer", min: 1, max: 5 },
    reading_mode: { type: "string", enum: ["page", "chapter", "percentage"] },
  });

  const { rows: oldRows } = await pool.query(
    "SELECT status, rating FROM user_books WHERE id = $1 AND user_id = $2",
    [req.params.id, req.userId]
  );

  const { rows } = await pool.query(`
    UPDATE user_books
    SET status = COALESCE($1, status),
        current_page = COALESCE($2, current_page),
        rating = COALESCE($3, rating),
        started_at = COALESCE($4, started_at),
        finished_at = COALESCE($5, finished_at),
        reading_mode = COALESCE($6, reading_mode)
    WHERE id = $7 AND user_id = $8
    RETURNING *
  `, [data.status, data.current_page, data.rating, req.body.started_at, req.body.finished_at,
       data.reading_mode, req.params.id, req.userId]);

  if (rows.length === 0) throw httpError(404, "No encontrado");

  // Eventos de logro: abandono (marcar como dejado) y retroalimentación
  // (editar la calificación de un libro ya terminado).
  const before = oldRows[0];
  if (data.status === "abandoned" && before && before.status !== "abandoned") {
    await pool.query("INSERT INTO achievement_events (user_id, code) VALUES ($1, 'abandono')", [req.userId]);
  }
  if (data.rating !== undefined && rows[0].status === "completed" && before && before.rating !== data.rating) {
    await pool.query("INSERT INTO achievement_events (user_id, code) VALUES ($1, 'retroalimentacion')", [req.userId]);
  }

  invalidateUserData(req.userId);
  let ach = null;
  try { ach = await recheckAchievements(req.userId); } catch {}
  res.json(await withFreshAchievements(rows[0], ach));
});

// GET /user-books/check/:google_id
router.get("/check/:google_id", async (req, res) => {
  const { rows } = await pool.query(`
    SELECT ub.id, ub.status, ub.started_at, ub.finished_at, ub.reading_mode, b.id AS book_db_id
    FROM user_books ub
    JOIN books b ON b.id = ub.book_id
    WHERE b.google_id = $1 AND ub.user_id = $2
      AND ub.is_archived = FALSE
  `, [req.params.google_id, req.userId]);

  if (rows.length > 0) {
    return res.json({ exists: true, status: rows[0].status, reading_mode: rows[0].reading_mode, id: rows[0].id, book_db_id: rows[0].book_db_id });
  }
  res.json({ exists: false });
});

// GET /user-books/:id/history — lecturas anteriores (archivadas) del mismo libro
// con sus estadísticas de sesiones, para la sección "Lecturas" de la ficha.
router.get("/:id/history", async (req, res) => {
  const { rows } = await pool.query(`
    SELECT ub.id AS user_book_id, ub.read_number, ub.started_at, ub.finished_at, ub.rating,
           COALESCE(COUNT(rs.id), 0)::int AS sessions,
           COALESCE(SUM(rs.duration_seconds), 0)::int AS duration_seconds,
           COALESCE(SUM(rs.pages_read), 0)::int AS pages_read
    FROM user_books ub
    LEFT JOIN reading_sessions rs ON rs.user_book_id = ub.id
    WHERE ub.user_id = $2
      AND ub.is_archived = TRUE
      AND ub.book_id = (SELECT book_id FROM user_books WHERE id = $1 AND user_id = $2)
    GROUP BY ub.id
    ORDER BY ub.read_number DESC
  `, [req.params.id, req.userId]);
  res.json(rows);
});

// POST /user-books/:id/reread — cierra la lectura actual (la archiva como
// historial) y abre la siguiente con fecha nueva y progreso desde cero.
router.post("/:id/reread", async (req, res) => {
  let startedAt = req.body.started_at ?? null;
  if (startedAt !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startedAt)) {
      throw httpError(400, "started_at no es una fecha válida");
    }
  } else {
    startedAt = appDay();
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`
      SELECT id, book_id, status, reading_mode
      FROM user_books
      WHERE id = $1 AND user_id = $2 AND is_archived = FALSE
      FOR UPDATE
    `, [req.params.id, req.userId]);
    if (rows.length === 0) throw httpError(404, "No encontrado");
    if (rows[0].status !== "completed") throw httpError(400, "Solo se puede releer un libro completado");

    const current = rows[0];
    await client.query("UPDATE user_books SET is_archived = TRUE WHERE id = $1", [current.id]);

    const { rows: numRows } = await client.query(
      `SELECT COALESCE(MAX(read_number), 0) + 1 AS next
       FROM user_books WHERE book_id = $1 AND user_id = $2`,
      [current.book_id, req.userId]
    );

    const inserted = await client.query(`
      INSERT INTO user_books (book_id, user_id, status, current_page, started_at, reading_mode, read_number)
      VALUES ($1, $2, 'reading', 0, $3, $4, $5)
      RETURNING *
    `, [current.book_id, req.userId, startedAt, current.reading_mode, numRows[0].next]);
    await client.query("COMMIT");

    invalidateUserData(req.userId);
    res.status(201).json(inserted.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
});

// DELETE /user-books/:id
router.delete("/:id", async (req, res) => {
  const result = await pool.query("DELETE FROM user_books WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
  if (result.rowCount === 0) throw httpError(404, "Libro no encontrado");
  invalidateUserData(req.userId);
  res.json({ message: "Libro eliminado" });
});

module.exports = router;