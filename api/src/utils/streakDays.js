const pool = require("../db/connection");
const { SQL } = require("./dates");

// A partir de esta fecha (UTC, hora del deploy) un día solo cuenta para la
// racha si las sesiones nuevas cumplen el mínimo del modo. Las sesiones
// anteriores quedan grandfathered: sumaban igual que siempre. Sobreescribible
// por env para ajustar la hora exacta del deploy sin tocar código.
const DEFAULT_RULE_SINCE = "2026-09-21 21:54:00";
const STREAK_RULE_SINCE = process.env.STREAK_RULE_SINCE || DEFAULT_RULE_SINCE;

const PAGE_MIN_SECONDS = 300; // 5 min
const OTHER_MIN_SECONDS = 420; // 7 min (% y capítulo)
const PAGE_ADVANCE = 2; // páginas nativas (o equivalentes)

// Semilla del avance de una sesión: pages_read cuando viene, si no el delta
// page - start_page (0 si no hay start_page: no se puede medir avance).
const ADVANCE_EXPR = `COALESCE(rs.pages_read,
  GREATEST(rs.page - COALESCE(rs.start_page, rs.page), 0))`;

// Fechas YYYY-MM-DD (hora Bogotá) que cuentan como día de racha según las
// reglas mínimas: un día califica si algún grupo (fecha, modo) de sus
// sesiones nuevas cumple el mínimo de duración y avance del modo, o si tuvo
// alguna sesión anterior al corte (histórico intacto).
async function getQualifyingDates(userId) {
  const { rows } = await pool.query(
    `
    WITH agg AS (
      SELECT ${SQL.toChar("rs.created_at")} AS date,
             ub.reading_mode AS mode,
             SUM(rs.duration_seconds)::bigint AS dur,
             SUM(${ADVANCE_EXPR}) AS adv
      FROM reading_sessions rs
      JOIN user_books ub ON ub.id = rs.user_book_id
      WHERE rs.user_id = $1 AND rs.created_at >= $2::timestamp
      GROUP BY 1, 2
    ),
    grandfathered AS (
      SELECT DISTINCT ${SQL.toChar()} AS date
      FROM reading_sessions
      WHERE user_id = $1 AND created_at < $2::timestamp
    )
    SELECT date FROM grandfathered
    UNION
    SELECT date FROM agg
    WHERE (mode = 'page'      AND dur >= $3 AND adv >= $4)
       OR (mode = 'percentage' AND dur >= $5)
       OR (mode = 'chapter'    AND dur >= $5)
    `,
    [userId, STREAK_RULE_SINCE, PAGE_MIN_SECONDS, PAGE_ADVANCE, OTHER_MIN_SECONDS]
  );
  return rows.map((r) => r.date);
}

// Fecha de hoy en hora Bogotá, como 'YYYY-MM-DD'.
async function appToday() {
  const { rows } = await pool.query(
    `SELECT TO_CHAR(${SQL.nowInApp()}, 'YYYY-MM-DD') AS d`
  );
  return rows[0].d;
}

// Progreso del día para el modal de feedback: agrupa las sesiones de `date`
// por modo y decide si el día califica (mismas reglas que getQualifyingDates,
// contando además las sesiones grandfathered). Opcionalmente excluye una sesión
// (para saber si fue ella la que cruzó el umbral). Regresa
// { qualifies, groups: [{ mode, seconds, pages, qualifies }], missing },
// donde `missing` (solo si no califica y no hay grandfathered) es el requisito
// más corto para calificar: { mode, seconds, pages } con lo que FALTA.
async function getDayProgress(userId, date, { excludeId = null } = {}) {
  const params = [userId, date, STREAK_RULE_SINCE];
  let exclude = "";
  if (excludeId != null) {
    params.push(excludeId);
    exclude = `AND rs.id <> $${params.length}`;
  }
  const { rows } = await pool.query(
    `SELECT ub.reading_mode AS mode,
            COALESCE(SUM(rs.duration_seconds), 0)::bigint AS dur,
            COALESCE(SUM(${ADVANCE_EXPR}), 0)::bigint AS adv,
            COALESCE(BOOL_OR(rs.created_at < $3::timestamp), false) AS grandfathered
     FROM reading_sessions rs
     JOIN user_books ub ON ub.id = rs.user_book_id
     WHERE rs.user_id = $1
       AND ${SQL.toChar("rs.created_at")} = $2
       ${exclude}
     GROUP BY 1`,
    params
  );

  if (rows.length === 0) return { qualifies: false, groups: [], missing: null };
  if (rows.some((r) => r.grandfathered)) {
    return {
      qualifies: true,
      groups: rows.map((r) => ({
        mode: r.mode,
        seconds: Number(r.dur),
        pages: Number(r.adv),
        qualifies: true,
      })),
      missing: null,
    };
  }

  const groups = rows.map((r) => {
    const qualifies =
      (r.mode === "page" && Number(r.dur) >= PAGE_MIN_SECONDS && Number(r.adv) >= PAGE_ADVANCE) ||
      ((r.mode === "percentage" || r.mode === "chapter") && Number(r.dur) >= OTHER_MIN_SECONDS);
    return { mode: r.mode, seconds: Number(r.dur), pages: Number(r.adv), qualifies };
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