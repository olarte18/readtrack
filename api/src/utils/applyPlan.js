const { normPair, pgTs } = require("./bookmoryImport");

// Ejecuta un plan de importación (libros + biblioteca + categorías + ciclos +
// sesiones + notas + metas) dentro de una transacción YA abierta (`client`).
// Es el motor compartido por el import de Bookmory y el de respaldo ReadTrack
// (GET /export / POST /import/readtrack): ambos producen el mismo formato de
// "plan" y este código lo fusiona sin duplicar.
//
// Aditivo sobre el flujo Bookmory original:
//   - user_books: reading_mode, is_archived y created_at (si vienen en el plan)
//   - sesiones: client_id (dedupe idempotente), start_page y started_at
//   - notas: dedupe por (book, content, page, created_at) al reimportar
//   - metas: plan.goals[] upsert por (user_id, type, year); si no viene, usa
//     yearlyGoals + dailyMinutes de Bookmory (compat hacia atrás)

const GOAL_TYPES = new Set(["annual", "monthly", "weekly", "daily"]);
const GOAL_METRICS = new Set(["books", "hours", "minutes"]);

const bulkInsert = async (client, table, columns, rows, chunkSize = 500) => {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const placeholders = [];
    const params = [];
    let n = 1;
    for (const row of slice) {
      placeholders.push(`(${row.map(() => `$${n++}`).join(",")})`);
      params.push(...row);
    }
    await client.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders.join(",")}`,
      params
    );
  }
};

const bulkInsertReturning = async (client, table, columns, rows, chunkSize = 500) => {
  const ids = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const placeholders = [];
    const params = [];
    let n = 1;
    for (const row of slice) {
      placeholders.push(`(${row.map(() => `$${n++}`).join(",")})`);
      params.push(...row);
    }
    const res = await client.query(
      `INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders.join(",")} RETURNING id`,
      params
    );
    ids.push(...res.rows.map((r) => r.id));
  }
  return ids;
};

const nowUtcNaive = () => new Date().toISOString().slice(0, 19).replace("T", " ");

async function applyPlan(client, userId, plan) {
  let booksCreated = 0;
  let booksMerged = 0;
  let sessionsCreated = 0;
  let notesCreated = 0;
  let categoriesCreated = 0;
  let cyclesCreated = 0;
  let goalsApplied = 0;

  // Mapa de libros existentes por título+autor para reutilizarlos en vez de duplicar
  const { rows: allBooks } = await client.query("SELECT id, title, author FROM books");
  const byPair = new Map();
  for (const row of allBooks) {
    byPair.set(normPair(row.title, row.author), { id: row.id });
  }

  // user_books del usuario con su book_id, para fusionar historial
  const { rows: owned } = await client.query(
    "SELECT id, book_id FROM user_books WHERE user_id = $1",
    [userId]
  );
  const ownedByBookId = new Map(owned.map((o) => [o.book_id, o.id]));

  // Claves de sesiones ya existentes del usuario, para deduplicar reimportaciones
  const { rows: sessExisting } = await client.query(
    `SELECT rs.user_book_id AS ubid,
            rs.client_id,
            TO_CHAR(rs.created_at, 'YYYY-MM-DD"T"HH24:MI:SS') AS ts,
            COALESCE(rs.duration_seconds, -1) AS dur,
            COALESCE(rs.pages_read, -1) AS pages
     FROM reading_sessions rs WHERE rs.user_id = $1`,
    [userId]
  );
  const existingSessionKeys = new Set(
    sessExisting.map((r) => `${r.ubid}|${r.ts}|${r.dur}|${r.pages}`)
  );
  const existingClientKeys = new Set(
    sessExisting.filter((r) => r.client_id).map((r) => `${r.ubid}|${r.client_id}`)
  );

  // Notas existentes del usuario (dedupe al reimportar un respaldo)
  const { rows: notesExisting } = await client.query(
    `SELECT book_id, content, page,
            COALESCE(TO_CHAR(created_at, 'YYYY-MM-DD"T"HH24:MI:SS'), '') AS ts
     FROM notes WHERE user_id = $1`,
    [userId]
  );
  const existingNoteKeys = new Set(
    notesExisting.map((r) => `${r.book_id}|${r.content}|${String(r.page)}|${r.ts}`)
  );

  // ---- Fase A: resolver ids de libros (nuevos en lote, existentes se actualizan) ----
  const bidToBookId = new Map();
  const pendingPairIdx = new Map();
  const newBookRows = [];
  const bookMergeUpdates = [];

  for (const book of plan.books) {
    if (!book.title) continue;
    const pair = normPair(book.title, book.author);
    const existing = byPair.get(pair);
    if (existing) {
      bidToBookId.set(book.bid, existing.id);
      bookMergeUpdates.push({ id: existing.id, cover: book.cover, description: book.description, pages: book.pages, publisher: book.publisher, bookType: book.bookType });
      booksMerged++;
    } else if (pendingPairIdx.has(pair)) {
      // duplicado dentro del archivo: apunta al libro que se va a crear
      const marker = `N${pendingPairIdx.get(pair)}`;
      bidToBookId.set(book.bid, marker);
      bookMergeUpdates.push({ marker, cover: book.cover, description: book.description, pages: book.pages, publisher: book.publisher, bookType: book.bookType });
      booksMerged++;
    } else {
      pendingPairIdx.set(pair, newBookRows.length);
      bidToBookId.set(book.bid, `N${newBookRows.length}`);
      newBookRows.push([book.googleId, book.title, book.author, book.cover, book.pages, book.year,
        book.isbn, book.description, null, book.publisher, book.bookType]);
      booksCreated++;
    }
  }

  if (newBookRows.length > 0) {
    const insertedIds = await bulkInsertReturning(
      client,
      "books",
      ["google_id", "title", "author", "cover", "pages", "year", "isbn", "description", "genre", "publisher", "book_type"],
      newBookRows
    );
    insertedIds.forEach((realId, idx) => {
      const marker = `N${idx}`;
      for (const [bid, val] of bidToBookId) {
        if (val === marker) bidToBookId.set(bid, realId);
      }
      for (const upd of bookMergeUpdates) {
        if (upd.marker === marker) { upd.id = realId; delete upd.marker; }
      }
    });
  }

  // Los datos de Bookmory/ReadTrack ganan cuando existen; se conservan los actuales si no
  for (const upd of bookMergeUpdates) {
    if (!upd.id) continue;
    await client.query(
      `UPDATE books SET
         cover = COALESCE($1, cover),
         description = COALESCE($2, description),
         pages = COALESCE($3, pages),
         publisher = COALESCE($4, publisher),
         book_type = COALESCE($5, book_type)
       WHERE id = $6`,
      [upd.cover, upd.description, upd.pages, upd.publisher, upd.bookType, upd.id]
    );
  }

  // ---- Fase B: entradas de usuario (nuevas en lote, existentes se actualizan) ----
  const bidToUb = new Map();
  const ubPendingIdx = new Map();
  const ubNewRows = [];
  const ubUpdates = [];
  const hasAnyUbCreatedAt = plan.books.some((b) => b.createdAtMs);

  for (const book of plan.books) {
    if (!book.title) continue;
    const bookId = bidToBookId.get(book.bid);
    const owned = ownedByBookId.get(bookId);
    const base = [book.status, book.currentPage || 0, book.rating, book.startedAt, book.finishedAt, book.review];
    const extras = [book.readingMode || "page", book.isArchived ? true : false];
    if (owned !== undefined) {
      bidToUb.set(book.bid, owned);
      ubUpdates.push([
        ...base,
        book.readingMode || null,
        typeof book.isArchived === "boolean" ? book.isArchived : null,
        owned,
      ]);
    } else if (ubPendingIdx.has(bookId)) {
      // duplicado dentro del archivo: comparte la entrada recién creada
      bidToUb.set(book.bid, `U${ubPendingIdx.get(bookId)}`);
    } else {
      ubPendingIdx.set(bookId, ubNewRows.length);
      bidToUb.set(book.bid, `U${ubNewRows.length}`);
      ubNewRows.push([bookId, userId, ...base, ...extras, book.createdAtMs ? pgTs(book.createdAtMs) : null]);
    }
  }

  // reading_mode/is_archived/created_at se cargan siempre; created_at solo se
  // escribe cuando alguno del lote lo trae (si no, deja el DEFAULT de la BD).
  if (ubNewRows.length > 0) {
    const cols = ["book_id", "user_id", "status", "current_page", "rating", "started_at", "finished_at", "review"];
    const rowsToInsert = ubNewRows;
    if (hasAnyUbCreatedAt) {
      cols.push("reading_mode", "is_archived", "created_at");
    } else {
      cols.push("reading_mode", "is_archived");
      for (const row of rowsToInsert) row.length = 10;
    }
    const insertedUbIds = await bulkInsertReturning(client, "user_books", cols, rowsToInsert);
    insertedUbIds.forEach((realId, idx) => {
      const marker = `U${idx}`;
      ownedByBookId.set(ubNewRows[idx][0], realId);
      for (const [bid, val] of bidToUb) {
        if (val === marker) bidToUb.set(bid, realId);
      }
    });
  }

  for (const u of ubUpdates) {
    await client.query(
      `UPDATE user_books SET status = $1, current_page = $2,
         rating = COALESCE($3, rating),
         started_at = COALESCE($4, started_at),
         finished_at = COALESCE($5, finished_at),
         review = COALESCE($6, review),
         reading_mode = COALESCE($7, reading_mode),
         is_archived = COALESCE($8, is_archived)
       WHERE id = $9`,
      u
    );
  }

  // ---- Fase C: dependientes, escritura masiva global ----
  const categoryRows = [];
  const categoryBookIds = new Set();
  const cycleRows = [];
  const cycleUbids = new Set();
  const sessionRows = [];
  const noteRows = [];
  const bidToNoteBook = new Map(plan.books.map((b) => [b.bid, bidToBookId.get(b.bid)]));

  for (const book of plan.books) {
    if (!book.title) continue;
    const bookId = bidToBookId.get(book.bid);
    const ubid = bidToUb.get(book.bid);
    if (!bookId || ubid == null) continue;

    for (let i = 0; i < book.categories.length; i++) {
      categoryRows.push([bookId, book.categories[i].name, book.categories[i].isPrimary, i]);
      categoryBookIds.add(bookId);
    }
    for (const cycle of book.cycles) {
      cycleRows.push([ubid, cycle.nth, cycle.startedAt, cycle.finishedAt, cycle.rating, cycle.review]);
      cycleUbids.add(ubid);
    }
    for (const day of book.sessionDays) {
      if (day.clientId) {
        const clientKey = `${ubid}|${day.clientId}`;
        if (existingClientKeys.has(clientKey)) continue;
        existingClientKeys.add(clientKey);
      } else {
        const key = `${ubid}|${pgTs(day.createdAtMs).replace(" ", "T")}|${day.durationSec ?? -1}|${day.pagesRead ?? -1}`;
        if (existingSessionKeys.has(key)) continue;
        existingSessionKeys.add(key);
      }
      sessionRows.push([
        ubid,
        userId,
        (day.page ?? book.currentPage) || 0,
        day.durationSec,
        day.pagesRead ?? 0,
        pgTs(day.createdAtMs),
        day.startPage ?? null,
        day.startMs ? pgTs(day.startMs) : null,
        day.clientId ?? null,
      ]);
      sessionsCreated++;
    }
  }

  if (categoryBookIds.size > 0) {
    await client.query("DELETE FROM book_categories WHERE book_id = ANY($1::int[])", [[...categoryBookIds]]);
  }
  await bulkInsert(client, "book_categories", ["book_id", "name", "is_primary", "position"], categoryRows);
  categoriesCreated += categoryRows.length;

  if (cycleUbids.size > 0) {
    await client.query("DELETE FROM reading_cycles WHERE user_book_id = ANY($1::int[])", [[...cycleUbids]]);
  }
  await bulkInsert(client, "reading_cycles", ["user_book_id", "nth", "started_at", "finished_at", "rating", "review"], cycleRows);
  cyclesCreated += cycleRows.length;

  const sessionCols = ["user_book_id", "user_id", "page", "duration_seconds", "pages_read", "created_at", "start_page", "started_at", "client_id"];
  await bulkInsert(client, "reading_sessions", sessionCols, sessionRows);

  for (const note of plan.notes) {
    const bookId = bidToNoteBook.get(note.bid);
    if (!bookId || !note.content) continue;
    const noteKey = `${bookId}|${note.content}|${note.page ?? null}|${note.createdAtMs ? pgTs(note.createdAtMs).replace(" ", "T") : ""}`;
    if (existingNoteKeys.has(noteKey)) continue;
    existingNoteKeys.add(noteKey);
    noteRows.push([bookId, userId, note.content, note.page, note.createdAtMs ? pgTs(note.createdAtMs) : null]);
  }
  await bulkInsert(client, "notes", ["book_id", "user_id", "content", "page", "created_at"], noteRows, 200);
  notesCreated = noteRows.length;

  // Metas: respaldo ReadTrack trae goals[] (todas); Bookmory trae yearlyGoals + dailyMinutes
  if (Array.isArray(plan.goals) && plan.goals.length > 0) {
    for (const g of plan.goals) {
      const year = Math.round(Number(g.year));
      const value = Math.round(Number(g.value));
      if (!GOAL_TYPES.has(g.type) || !GOAL_METRICS.has(g.metric)) continue;
      if (!Number.isFinite(year) || year < 2000 || year > 2100 || !Number.isFinite(value) || value <= 0) continue;
      await client.query(
        `INSERT INTO reading_goals (user_id, type, metric, value, year)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (user_id, type, year)
         DO UPDATE SET metric = EXCLUDED.metric, value = EXCLUDED.value`,
        [userId, g.type, g.metric, value, year]
      );
      goalsApplied++;
    }
  } else {
    for (const goal of plan.yearlyGoals ?? []) {
      await client.query(
        `INSERT INTO reading_goals (user_id, type, metric, value, year)
         VALUES ($1,'annual','books',$2,$3)
         ON CONFLICT (user_id, type, year) DO UPDATE SET metric = 'books', value = EXCLUDED.value`,
        [userId, goal.value, goal.year]
      );
      goalsApplied++;
    }
    if (plan.dailyMinutes > 0) {
      const currentYear = new Date().getFullYear();
      await client.query(
        `INSERT INTO reading_goals (user_id, type, metric, value, year)
         VALUES ($1,'daily','minutes',$2,$3)
         ON CONFLICT (user_id, type, year) DO UPDATE SET metric = 'minutes', value = EXCLUDED.value`,
        [userId, plan.dailyMinutes, currentYear]
      );
      goalsApplied++;
    }
  }

  return {
    booksCreated,
    booksMerged,
    imported: booksCreated + booksMerged,
    sessions: sessionsCreated,
    notes: notesCreated,
    categories: categoriesCreated,
    cycles: cyclesCreated,
    goals: goalsApplied,
  };
}

module.exports = { applyPlan };