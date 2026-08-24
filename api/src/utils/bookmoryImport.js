const { bogotaDay } = require("./bookmory");

// Convierte los datos crudos de Bookmory en un plan de importación y lo
// ejecuta dentro de una transacción de Postgres.

const STATUS_MAP = {
  DONE: "completed",
  READING: "reading",
  PAUSE: "paused",
  NOT_STARTED: "pending",
};

const normText = (v) =>
  String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const normPair = (title, author) => `${normText(title)}|${normText(author).split(",")[0]}`;

const toIsoDate = (ms) => {
  const n = Number(ms);
  if (!n || !Number.isFinite(n)) return null;
  return new Date(n).toISOString().split("T")[0];
};

// TIMESTAMP naive en UTC para columnas sin zona (las fechas se convierten a
// America/Bogota al consultar).
const pgTs = (ms) => {
  const n = Number(ms);
  if (!n || !Number.isFinite(n)) return null;
  return new Date(n).toISOString().slice(0, 19).replace("T", " ");
};

// Etiqueta YYYY-MM-DD tal cual: los caches de racha guardan el día LOCAL
// rotulado a medianoche UTC, no hay que convertirlo a otra zona.
const utcDayLabel = (ms) => new Date(Number(ms)).toISOString().split("T")[0];

const mapBookType = (raw) => {
  const s = String(raw ?? "").toLowerCase();
  if (!s) return null;
  if (s.includes("ebook") || s.includes("e-book")) return "ebook";
  if (s.includes("audio")) return "audio";
  if (s.includes("paper") || s.includes("fisic") || s.includes("físic") || s.includes("print")) return "physical";
  return null;
};

const cleanCategoryName = (raw) =>
  String(raw ?? "")
    .replace(/^#+/, "")
    .trim()
    .slice(0, 40);

const quillToText = (quillJson) => {
  try {
    const arr = typeof quillJson === "string" ? JSON.parse(quillJson) : quillJson;
    if (!Array.isArray(arr)) return null;
    const text = arr
      .filter((op) => typeof op?.insert === "string")
      .map((op) => op.insert)
      .join("")
      .replace(/\n+$/, "")
      .trim();
    return text ? text.slice(0, 5000) : null;
  } catch {
    return null;
  }
};

// Reconstruye las sesiones de lectura combinando tres fuentes:
//  1. read_timer_list: sesiones reales con cronómetro (duración y fecha de inicio)
//  2. page_log_list: actualizaciones de progreso; cada delta son páginas leídas,
//     y se asignan al timer cuyo cierre coincide (Bookmory los crea juntos)
//  3. streak_caches: días con actividad sin rastro de lo anterior -> sesión mínima
// Devuelve filas listas para reading_sessions.
function buildSessions(readsArr, streakDaysForBid, realTotal) {
  const logs = [];
  for (const read of readsArr ?? []) {
    for (const pl of read.page_log_list ?? []) {
      const ts = Number(pl.created_at);
      const val = Number(pl.page);
      if (!ts || !Number.isFinite(val)) continue;
      logs.push({ ts, val, type: pl.page_type || read.page_type || "PAGE" });
    }
  }
  logs.sort((a, b) => a.ts - b.ts);

  // Páginas leídas en cada actualización (delta contra la anterior del libro)
  const deltaByTs = new Map();
  let prev = null;
  for (const log of logs) {
    let delta = 0;
    if (prev) {
      let raw = log.val - prev.val;
      if (log.type === "PERCENT" || prev.type === "PERCENT") raw = (raw * Number(realTotal || 0)) / 100;
      delta = Math.max(0, Math.round(raw));
    }
    deltaByTs.set(log.ts, delta);
    prev = log;
  }

  const MATCH_WINDOW_MS = 10 * 60 * 1000;
  const sessions = [];
  const usedLogTs = new Set();

  for (const read of readsArr ?? []) {
    for (const t of read.read_timer_list ?? []) {
      const closeTs = Number(t.created_at) || Number(t.updated_at);
      const startTs = Number(t.read_started_at) || closeTs;
      const secs = Math.max(0, Math.round(Number(t.elapsed_sec) || 0));
      if (!closeTs) continue;

      let best = null;
      for (const log of logs) {
        if (usedLogTs.has(log.ts)) continue;
        if (best === null || Math.abs(log.ts - closeTs) < Math.abs(best.ts - closeTs)) best = log;
      }
      let pages = 0;
      if (best !== null && Math.abs(best.ts - closeTs) <= MATCH_WINDOW_MS) {
        pages = deltaByTs.get(best.ts) ?? 0;
        usedLogTs.add(best.ts);
      }

      sessions.push({
        createdAtMs: closeTs,
        startMs: startTs,
        pagesRead: pages,
        durationSec: secs,
      });
    }
  }

  // Actualizaciones sin cronómetro (edición manual de página): sesión sintética
  // solo si aportan páginas; se agrupan por día.
  const orphansByDay = new Map();
  for (const log of logs) {
    if (usedLogTs.has(log.ts)) continue;
    const delta = deltaByTs.get(log.ts) ?? 0;
    if (delta <= 0) continue;
    const day = bogotaDay(log.ts);
    const cur = orphansByDay.get(day);
    if (cur) {
      cur.pages += delta;
      cur.lastTs = Math.max(cur.lastTs, log.ts);
    } else {
      orphansByDay.set(day, { pages: delta, lastTs: log.ts });
    }
  }
  for (const [day, v] of orphansByDay) {
    sessions.push({ createdAtMs: v.lastTs, pagesRead: v.pages, durationSec: null });
  }

  // Días de racha sin ningún rastro (cronómetro sin actualizar página):
  // sesión mínima al mediodía de Colombia para que el día cuente igual.
  const daysWithSession = new Set(sessions.map((s) => bogotaDay(s.createdAtMs)));
  for (const dayMs of streakDaysForBid ?? []) {
    const label = utcDayLabel(dayMs);
    if (!daysWithSession.has(label)) {
      sessions.push({
        createdAtMs: Date.parse(`${label}T17:00:00Z`),
        pagesRead: 0,
        durationSec: null,
      });
    }
  }

  return sessions
    .map((s) => ({ ...s, day: bogotaDay(s.createdAtMs) }))
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
}

// Construye el plan completo (sin tocar la base de datos).
function buildPlan(parsed) {
  const streakDaysByBid = new Map();
  for (const cache of parsed.streakCaches ?? []) {
    for (const bid of cache.bids ?? []) {
      if (!streakDaysByBid.has(bid)) streakDaysByBid.set(bid, []);
      streakDaysByBid.get(bid).push(cache.dateMs);
    }
  }

  const tagNameByBidPart = new Map(); // bid -> [nombres en orden de creación]
  for (const tag of parsed.tags ?? []) {
    const name = cleanCategoryName(tag.name);
    if (!name) continue;
    for (const bid of tag.bids ?? []) {
      if (!tagNameByBidPart.has(bid)) tagNameByBidPart.set(bid, []);
      tagNameByBidPart.get(bid).push(name);
    }
  }

  const books = [];
  for (const b of parsed.books ?? []) {
    const statusList = Array.isArray(b.status_list) ? b.status_list : [];
    const mainStatus = statusList[0];
    const status = b.wishlist ? "wishlist" : STATUS_MAP[mainStatus] ?? "pending";
    const realTotal = Math.round(Number(b.real_total_page) || 0);
    const percentMode = b.page_type === "PERCENT";
    const pages = percentMode ? realTotal : Math.round(Number(b.total_page) || 0) || realTotal;

    const firstCycle = (b.reads ?? []).find((r) => Number(r.nth) === 1) ?? (b.reads ?? [])[0] ?? {};
    const currentPage = (() => {
      const cur = Number(b.cur_page) || 0;
      return percentMode ? Math.min(Math.round((cur * realTotal) / 100), realTotal || cur) : cur;
    })();

    const seen = new Set();
    const categories = (tagNameByBidPart.get(b.bid) ?? [])
      .filter((name) => {
        const k = name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 3)
      .map((name, i) => ({ name, isPrimary: i === 0 }));

    const cycles = (b.reads ?? [])
      .filter((r) => Number(r.nth) >= 2 && r.status === "DONE")
      .map((r) => ({
        nth: Number(r.nth),
        startedAt: toIsoDate(r.start),
        finishedAt: toIsoDate(r.end),
        rating: Number(r.star) > 0 ? Math.round(Number(r.star)) : null,
        review: String(r.comment ?? "").trim().slice(0, 2000) || null,
      }));

    const sessionDays = buildSessions(b.reads, streakDaysByBid.get(b.bid), realTotal);

    books.push({
      bid: b.bid,
      googleId: `bm-${b.bid}`,
      title: String(b.title ?? "").trim(),
      author: String(b.author ?? "").trim() || null,
      cover: b.image || null,
      pages: pages || null,
      isbn: String(b.isbn ?? "").trim() || null,
      description: String(b.description ?? "").trim().slice(0, 5000) || null,
      publisher: String(b.publisher ?? "").trim().slice(0, 120) || null,
      bookType: mapBookType(b.book_type),
      year: /^\d{4}/.test(String(b.publication_date ?? "")) ? String(b.publication_date).slice(0, 4) : null,
      status,
      currentPage,
      rating: Number(firstCycle.star ?? b.last_read_done_star) > 0 ? Math.round(Number(firstCycle.star ?? b.last_read_done_star)) : null,
      startedAt: toIsoDate(firstCycle.start ?? b.first_read_start_date),
      finishedAt: toIsoDate(firstCycle.end ?? b.last_read_done_date),
      review: String(firstCycle.comment ?? "").trim().slice(0, 2000) || null,
      categories,
      cycles,
      sessionDays,
    });
  }

  const notes = (parsed.notes ?? []).map((n) => ({
    bid: n.bid,
    content: quillToText(n.content_quill),
    page: (() => {
      const p = Number(n.page) || 0;
      if (p <= 0) return null;
      if (n.page_type === "PERCENT") {
        const book = parsed.books.find((x) => x.bid === n.bid);
        const real = Math.round(Number(book?.real_total_page) || 0);
        return real ? Math.min(Math.round((p * real) / 100), real) : null;
      }
      return Math.round(p);
    })(),
    createdAtMs: Number(n.created_at) || null,
  })).filter((n) => n.content);

  return {
    books,
    notes,
    yearlyGoals: (parsed.yearlyGoals ?? [])
      .map((g) => ({ year: Math.round(Number(g.year)), value: Math.round(Number(g.goal)) }))
      .filter((g) => g.year >= 2000 && g.year <= 2100 && g.value > 0),
    dailyMinutes: parsed.dailyGoal?.seconds ? Math.round(parsed.dailyGoal.seconds / 60) : null,
  };
}

module.exports = { buildPlan, normPair, pgTs };
