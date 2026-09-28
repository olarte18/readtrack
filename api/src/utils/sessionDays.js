const pool = require("../db/connection");
const { SQL } = require("./dates");

const DAY_MS = 86400000;

// Milisegundos (mediodía UTC) de una fecha YYYY-MM-DD. Mediodía evita
// cualquier borde de zona al construir fechas UTC.
function dayMs(dateStr) {
  return Date.parse(`${dateStr}T12:00:00Z`);
}

// Límites de los periodos actuales (día/semana/mes) en hora Bogotá, como
// strings YYYY-MM-DD del día de inicio de cada periodo.
async function appBoundaries() {
  const { rows } = await pool.query(
    `SELECT TO_CHAR(date_trunc('day', ${SQL.nowInApp()})::date, 'YYYY-MM-DD') AS day,
            TO_CHAR(date_trunc('week', ${SQL.nowInApp()})::date, 'YYYY-MM-DD') AS week,
            TO_CHAR(date_trunc('month', ${SQL.nowInApp()})::date, 'YYYY-MM-DD') AS month`
  );
  return rows[0];
}

// Partida cada sesión de lectura en la actividad diaria (hora Bogotá):
//  - Sesiones con `started_at` real (las nuevas): se parten según el intervalo
//    [inicio, inicio + duración]; una sesión que cruza la medianoche aporta
//    cada parte al día que le toca. El avance de páginas se reparte
//    proporcional al tiempo con el método del mayor resto (cada día se lleva
//    su piso y el resto va al bucket con más tiempo; así la suma se conserva).
//  - Sesiones sin `started_at` (historial previo a ese campo): toda la sesión
//    se atribuye al día Bogotá de `created_at`, igual que antes del split. Así
//    el historial y la racha no cambian de día retroactivamente.
// Regresa [{ session_id, user_book_id, mode, created_at, date, seconds,
// pages }], ordenado por (session_id, date).
async function bucketReadingDays(userId) {
  const { rows } = await pool.query(
    `
    WITH spans AS (
      SELECT rs.id AS session_id,
             rs.user_book_id,
             ub.reading_mode AS mode,
             rs.created_at,
             rs.started_at,
             rs.duration_seconds,
             COALESCE(rs.pages_read,
               GREATEST(rs.page - COALESCE(rs.start_page, rs.page), 0))::bigint AS adv
      FROM reading_sessions rs
      JOIN user_books ub ON ub.id = rs.user_book_id
      WHERE rs.user_id = $1
    ),
    spans_full AS (
      SELECT s.*,
             COALESCE(s.started_at,
               s.created_at - make_interval(secs => COALESCE(s.duration_seconds, 0))) AS start_ts,
             COALESCE(s.started_at,
               s.created_at - make_interval(secs => COALESCE(s.duration_seconds, 0)))
               + make_interval(secs => COALESCE(s.duration_seconds, 0)) AS end_ts
      FROM spans s
    ),
    days AS (
      SELECT s.*, b.day AS day_ts,
             s.start_ts AT TIME ZONE 'UTC' AS start_tsz,
             s.end_ts AT TIME ZONE 'UTC' AS end_tsz
      FROM spans_full s
      CROSS JOIN LATERAL generate_series(
        ${SQL.dayStartUtc("s.start_ts")},
        s.end_ts AT TIME ZONE 'UTC',
        interval '1 day'
      ) AS b(day)
      WHERE s.started_at IS NOT NULL
    ),
    overlap AS (
      SELECT d.*,
             EXTRACT(EPOCH FROM
               LEAST(d.end_tsz, d.day_ts + interval '1 day')
               - GREATEST(d.start_tsz, d.day_ts))::bigint AS secs,
             EXTRACT(EPOCH FROM d.end_tsz - d.start_tsz)::bigint AS total_secs,
             TO_CHAR(${SQL.tstzToApp("d.day_ts")}, 'YYYY-MM-DD') AS date
      FROM days d
      WHERE d.end_tsz > d.start_tsz
        AND LEAST(d.end_tsz, d.day_ts + interval '1 day') > GREATEST(d.start_tsz, d.day_ts)
    ),
    split AS (
      SELECT o.*,
             FLOOR(o.adv::numeric * o.secs / o.total_secs)::bigint AS floor_pages,
             SUM(FLOOR(o.adv::numeric * o.secs / o.total_secs)::bigint)
               OVER (PARTITION BY o.session_id) AS floor_sum,
             ROW_NUMBER() OVER (PARTITION BY o.session_id ORDER BY o.secs DESC, o.date ASC) AS rn
      FROM overlap o
    )
    SELECT session_id, user_book_id, mode, created_at, date, secs,
           floor_pages + CASE WHEN rn = 1 THEN adv - floor_sum ELSE 0 END AS pages
    FROM split
    UNION ALL
    SELECT s.session_id, s.user_book_id, s.mode, s.created_at,
           TO_CHAR(${SQL.utcToApp("s.created_at")}, 'YYYY-MM-DD') AS date,
           EXTRACT(EPOCH FROM (s.end_ts - s.start_ts))::bigint AS secs,
           s.adv AS pages
    FROM spans_full s
    WHERE s.started_at IS NULL
    ORDER BY session_id, date
    `,
    [userId]
  );
  return rows;
}

module.exports = { bucketReadingDays, appBoundaries, dayMs };