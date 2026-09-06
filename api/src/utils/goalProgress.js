const pool = require("../db/connection");

const BOGOTA_TZ = "America/Bogota";
const bogotaYear = () => Number(new Intl.DateTimeFormat("en-CA", { timeZone: BOGOTA_TZ, year: "numeric" }).format(new Date()));

// Devuelve solo las metas que se superaron JUSTO con la sesión que se acaba de
// guardar: compara el progreso actual contra el progreso anterior (sin esta
// sesión ni el libro terminado en este guardado).
async function getGoalCompletion(userId, opts = {}) {
  const { excludeSeconds = 0, bookCompleted = false } = opts;
  const year = bogotaYear();
  const { rows: goals } = await pool.query(
    "SELECT type, metric, value FROM reading_goals WHERE user_id = $1 AND year = $2",
    [userId, year]
  );
  if (goals.length === 0) return [];

  const now = await computeProgress(userId);
  const before = subtractProgress(now, excludeSeconds, bookCompleted);

  const completed = [];
  for (const goal of goals) {
    const current = goalCurrent(goal, now);
    const previous = goalCurrent(goal, before);
    const value = Number(goal.value);
    if (current !== null && previous !== null && previous < value && current >= value) {
      completed.push({ type: goal.type, metric: goal.metric, value, current });
    }
  }
  return completed;
}

// Progreso "anterior": quita los segundos de la sesión recién insertada y el
// libro que se marcó como terminado en este mismo guardado.
function subtractProgress(progress, excludeSeconds, bookCompleted) {
  const minutes = Math.round(Number(excludeSeconds || 0) / 60);
  return {
    annual: progress.annual - (bookCompleted ? 1 : 0),
    monthly_books: progress.monthly_books - (bookCompleted ? 1 : 0),
    daily: progress.daily - minutes,
    weekly: progress.weekly - minutes,
    monthly_minutes: progress.monthly_minutes - minutes,
  };
}

// Progreso de una meta en unidades de su propia métrica.
function goalCurrent(goal, progress) {
  const { type, metric } = goal;
  switch (metric) {
    case "books":
      return type === "annual" ? progress.annual : progress.monthly_books;
    case "minutes":
      return progress.daily; // solo daily usa minutes
    case "hours": {
      // weekly y monthly usan horas
      const minutes = type === "weekly" ? progress.weekly : progress.monthly_minutes;
      return Math.round(minutes / 60);
    }
    default:
      return null;
  }
}

async function computeProgress(userId) {
  const result = {};

  const { rows: books } = await pool.query(
    `SELECT
       COUNT(*) FILTER (
         WHERE finished_at >= date_trunc('year', NOW() AT TIME ZONE $2)::date
           AND finished_at < (date_trunc('year', NOW() AT TIME ZONE $2) + INTERVAL '1 year')::date
       ) AS annual,
       COUNT(*) FILTER (
         WHERE finished_at >= date_trunc('month', NOW() AT TIME ZONE $2)::date
           AND finished_at < (date_trunc('month', NOW() AT TIME ZONE $2) + INTERVAL '1 month')::date
       ) AS monthly_books
     FROM user_books
     WHERE user_id = $1 AND status = 'completed'`,
    [userId, BOGOTA_TZ]
  );
  result.annual = parseInt(books[0].annual);
  result.monthly_books = parseInt(books[0].monthly_books);

  const { rows: seconds } = await pool.query(
    `SELECT
       COALESCE(SUM(duration_seconds) FILTER (
         WHERE created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'
           >= date_trunc('day', NOW() AT TIME ZONE 'America/Bogota')
       ), 0) AS daily_seconds,
       COALESCE(SUM(duration_seconds) FILTER (
         WHERE created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'
           >= date_trunc('week', NOW() AT TIME ZONE 'America/Bogota')
       ), 0) AS weekly_seconds,
       COALESCE(SUM(duration_seconds) FILTER (
         WHERE created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'
           >= date_trunc('month', NOW() AT TIME ZONE 'America/Bogota')
       ), 0) AS monthly_seconds
     FROM reading_sessions
     WHERE user_id = $1`,
    [userId]
  );
  result.daily = Math.round(parseInt(seconds[0].daily_seconds) / 60);
  result.weekly = Math.round(parseInt(seconds[0].weekly_seconds) / 60);
  result.monthly_minutes = Math.round(parseInt(seconds[0].monthly_seconds) / 60);

  return result;
}

module.exports = { getGoalCompletion };
