const pool = require("../db/connection");
const { APP_TZ, appYear } = require("./dates");
const { bucketReadingDays, appBoundaries, dayMs } = require("./sessionDays");

// Devuelve solo las metas que se superaron JUSTO con la sesión que se acaba de
// guardar: compara el progreso actual contra el progreso anterior (sin esta
// sesión ni el libro terminado en este guardado).
async function getGoalCompletion(userId, opts = {}) {
  const { excludeSeconds = 0, bookCompleted = false } = opts;
  const year = appYear();
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
     WHERE user_id = $1 AND status = 'completed'
       AND is_archived = FALSE`,
    [userId, APP_TZ]
  );
  result.annual = parseInt(books[0].annual);
  result.monthly_books = parseInt(books[0].monthly_books);

  // Minutos por periodo según los lapsos de las sesiones (sessionDays): una
  // sesión cruzando medianoche ya repartió el tiempo entre los días que toca.
  const [boundaries, buckets] = await Promise.all([appBoundaries(), bucketReadingDays(userId)]);
  const weekMs = dayMs(boundaries.week);
  const monthPrefix = boundaries.month.slice(0, 7);
  let dailySeconds = 0;
  let weeklySeconds = 0;
  let monthlySeconds = 0;
  for (const b of buckets) {
    const secs = Number(b.secs);
    if (b.date === boundaries.day) dailySeconds += secs;
    if (dayMs(b.date) >= weekMs) weeklySeconds += secs;
    if (b.date.slice(0, 7) === monthPrefix) monthlySeconds += secs;
  }
  result.daily = Math.round(dailySeconds / 60);
  result.weekly = Math.round(weeklySeconds / 60);
  result.monthly_minutes = Math.round(monthlySeconds / 60);

  return result;
}

module.exports = { getGoalCompletion };
