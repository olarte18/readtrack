const pool = require("../db/connection");
const { SQL } = require("./dates");
const { bucketReadingDays } = require("./sessionDays");

// A partir de esta fecha (UTC, hora del deploy) un día solo cuenta para la
// racha si las sesiones nuevas cumplen el mínimo del modo. Las sesiones
// anteriores quedan grandfathered: sumaban igual que siempre. Sobreescribible
// por env para ajustar la hora exacta del deploy sin tocar código.
const DEFAULT_RULE_SINCE = "2026-09-21 21:54:00";
const STREAK_RULE_SINCE = process.env.STREAK_RULE_SINCE || DEFAULT_RULE_SINCE;

const PAGE_MIN_SECONDS = 300; // 5 min
const OTHER_MIN_SECONDS = 420; // 7 min (% y capítulo)
const PAGE_ADVANCE = 2; // páginas nativas (o equivalentes)

// Instante del corte de la regla (ms): una sesión creada después solo cuenta
// para la racha si su día cumple el mínimo del modo.
const RULE_SINCE_MS = Date.parse(`${STREAK_RULE_SINCE.replace(" ", "T")}Z`);

// Fechas YYYY-MM-DD (hora Bogotá) que cuentan como día de racha según las
// reglas mínimas: un día califica si algún grupo (fecha, modo) de los lapsos
// de sus sesiones (sessionDays) que inician después del corte cumple el
// mínimo de duración y avance del modo, o si tuvo alguna sesión anterior al
// corte (histórico intacto). Acepta los buckets ya calculados para no repetir
// la consulta.
async function getQualifyingDates(userId, buckets = null) {
  const list = buckets ?? (await bucketReadingDays(userId));
  const grandfathered = new Set();
  const agg = new Map();

  for (const row of list) {
    if (row.created_at.getTime() < RULE_SINCE_MS) {
      grandfathered.add(row.date);
      continue;
    }
    const key = `${row.date}|${row.mode ?? ""}`;
    const g = agg.get(key) ?? { seconds: 0, pages: 0 };
    g.seconds += Number(row.secs);
    g.pages += Number(row.pages);
    agg.set(key, g);
  }

  const dates = new Set(grandfathered);
  for (const [key, g] of agg) {
    const sep = key.indexOf("|");
    const date = key.slice(0, sep);
    const mode = key.slice(sep + 1);
    const qualifies =
      (mode === "page" && g.seconds >= PAGE_MIN_SECONDS && g.pages >= PAGE_ADVANCE) ||
      ((mode === "percentage" || mode === "chapter") && g.seconds >= OTHER_MIN_SECONDS);
    if (qualifies) dates.add(date);
  }
  return [...dates];
}

// Fecha de hoy en hora Bogotá, como 'YYYY-MM-DD'.
async function appToday() {
  const { rows } = await pool.query(
    `SELECT TO_CHAR(${SQL.nowInApp()}, 'YYYY-MM-DD') AS d`
  );
  return rows[0].d;
}

// Progreso del día para el modal de feedback: agrupa los lapsos de las
// sesiones de `date` por modo y decide si el día califica (mismas reglas que
// getQualifyingDates, contando además las sesiones grandfathered).
// Opcionalmente excluye una sesión (para saber si fue ella la que cruzó el
// umbral) o recibe los buckets ya calculados. Regresa
// { qualifies, groups: [{ mode, seconds, pages, qualifies }], missing },
// donde `missing` (solo si no califica y no hay grandfathered) es el requisito
// más corto para calificar: { mode, seconds, pages } con lo que FALTA.
async function getDayProgress(userId, date, { excludeId = null, buckets = null } = {}) {
  const list = buckets ?? (await bucketReadingDays(userId));
  const rows = list.filter(
    (r) => r.date === date && (excludeId === null || r.session_id !== excludeId)
  );

  if (rows.length === 0) return { qualifies: false, groups: [], missing: null };

  const byMode = new Map();
  for (const r of rows) {
    const key = r.mode ?? "";
    const g = byMode.get(key) ?? { seconds: 0, pages: 0, grandfathered: false };
    g.seconds += Number(r.secs);
    g.pages += Number(r.pages);
    if (r.created_at.getTime() < RULE_SINCE_MS) g.grandfathered = true;
    byMode.set(key, g);
  }

  if ([...byMode.values()].some((g) => g.grandfathered)) {
    return {
      qualifies: true,
      groups: [...byMode.entries()].map(([mode, g]) => ({
        mode: mode || null,
        seconds: g.seconds,
        pages: g.pages,
        qualifies: true,
      })),
      missing: null,
    };
  }

  const groups = [...byMode.entries()].map(([mode, g]) => {
    const qualifies =
      (mode === "page" && g.seconds >= PAGE_MIN_SECONDS && g.pages >= PAGE_ADVANCE) ||
      ((mode === "percentage" || mode === "chapter") && g.seconds >= OTHER_MIN_SECONDS);
    return { mode: mode || null, seconds: g.seconds, pages: g.pages, qualifies };
  });

  const qualifies = groups.some((g) => g.qualifies);
  let missing = null;
  if (!qualifies) {
    const candidates = groups.map((g) => {
      const seconds = g.mode === "page" ? Math.max(0, PAGE_MIN_SECONDS - g.seconds) : Math.max(0, OTHER_MIN_SECONDS - g.seconds);
      const pages = g.mode === "page" ? Math.max(0, PAGE_ADVANCE - g.pages) : 0;
      return { mode: g.mode, seconds, pages, score: seconds * 60 + pages };
    });
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0];
    missing = { mode: best.mode, seconds: best.seconds, pages: best.pages };
  }

  return { qualifies, groups, missing };
}

module.exports = { getQualifyingDates, getDayProgress, appToday, STREAK_RULE_SINCE };