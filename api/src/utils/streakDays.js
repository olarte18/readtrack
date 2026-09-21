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

module.exports = { getQualifyingDates, STREAK_RULE_SINCE };