const pool = require("../db/connection");
const { SQL } = require("./dates");

// Constantes del sistema de puntos (sobreescribibles por env para ajustar sin
// deploy de código). 100 pts/hora => 30 min = 50, 15 min = 25, 5 min = 8.
const POINTS_PER_HOUR = Number(process.env.STREAK_POINTS_PER_HOUR || 100);
const PROTECTOR_COST = Number(process.env.STREAK_PROTECTOR_COST || 400);
const DAILY_CAP = Number(process.env.STREAK_POINTS_DAILY_CAP || 500);

// Mismas reglas mínimas que streakDays.js: una sesión solo da puntos si por sí
// sola calificaría para la racha (se evita farmear con sesiones de segundos).
const PAGE_MIN_SECONDS = 300;
const OTHER_MIN_SECONDS = 420;
const PAGE_ADVANCE = 2;

// Puntos por una duración en segundos (redondeo al entero más cercano).
function pointsFor(seconds) {
  const s = Number(seconds) || 0;
  if (s <= 0) return 0;
  return Math.round((s / 3600) * POINTS_PER_HOUR);
}

// ¿La sesión califica para dar puntos? Misma regla de modo que la racha.
function qualifiesForPoints(mode, durationSeconds, advance) {
  const s = Number(durationSeconds) || 0;
  const adv = Number(advance) || 0;
  if (mode === "page") return s >= PAGE_MIN_SECONDS && adv >= PAGE_ADVANCE;
  return s >= OTHER_MIN_SECONDS; // percentage y chapter
}

// Saldo actual = suma del ledger.
async function getBalance(userId) {
  const { rows } = await pool.query(
    "SELECT COALESCE(SUM(delta), 0)::int AS balance FROM streak_point_events WHERE user_id = $1",
    [userId]
  );
  return rows[0].balance;
}

// Puntos ganados hoy (día Bogotá) para aplicar el tope diario.
async function getEarnedToday(userId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(delta), 0)::int AS earned
     FROM streak_point_events
     WHERE user_id = $1 AND reason = 'earn'
       AND TO_CHAR(${SQL.utcToApp("created_at")}, 'YYYY-MM-DD')
         = TO_CHAR(${SQL.nowInApp()}, 'YYYY-MM-DD')`,
    [userId]
  );
  return rows[0].earned;
}

// Otorga los puntos de una sesión recién insertada, respetando el tope diario.
// Idempotente: el índice único (user_id, session_id) evita duplicar ante un
// reintento o un segundo envío del mismo client_id. Devuelve los puntos dados.
async function awardPointsForSession(userId, session) {
  if (!session || session.id == null) return 0;

  const { rows: ub } = await pool.query(
    "SELECT reading_mode FROM user_books WHERE id = $1 AND user_id = $2",
    [session.user_book_id, userId]
  );
  const mode = ub[0]?.reading_mode ?? "page";
  const advance =
    session.pages_read != null
      ? Number(session.pages_read)
      : Math.max(0, Number(session.page) - Number(session.start_page ?? session.page));

  if (!qualifiesForPoints(mode, session.duration_seconds, advance)) return 0;

  const earnedToday = await getEarnedToday(userId);
  const room = Math.max(0, DAILY_CAP - earnedToday);
  const points = Math.min(pointsFor(session.duration_seconds), room);
  if (points <= 0) return 0;

  const { rows } = await pool.query(
    `INSERT INTO streak_point_events (user_id, delta, reason, session_id)
     VALUES ($1, $2, 'earn', $3)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [userId, points, session.id]
  );
  if (rows.length === 0) return 0; // ya se había otorgado
  return points;
}

// Puntos ya otorgados por una sesión (para el reenvío idempotente de la cola
// offline: el cliente vuelve a pedir la misma sesión y debe ver su recompensa).
async function getSessionPoints(userId, sessionId) {
  const { rows } = await pool.query(
    "SELECT delta FROM streak_point_events WHERE user_id = $1 AND session_id = $2 AND reason = 'earn'",
    [userId, sessionId]
  );
  return rows[0]?.delta ?? 0;
}

// Regala 1 protector la primera vez que el usuario entra al sistema (idempotente
// por el índice único parcial de source='gift').
async function ensureGift(userId) {
  await pool.query(
    `INSERT INTO streak_protectors (user_id, source, cost)
     VALUES ($1, 'gift', 0)
     ON CONFLICT DO NOTHING`,
    [userId]
  );
}

module.exports = {
  POINTS_PER_HOUR,
  PROTECTOR_COST,
  DAILY_CAP,
  pointsFor,
  qualifiesForPoints,
  getBalance,
  getEarnedToday,
  awardPointsForSession,
  getSessionPoints,
  ensureGift,
};
