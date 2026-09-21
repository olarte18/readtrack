const pool = require("../db/connection");
const cache = require("./cache");
const { computeStreaks } = require("./streaks");
const { getQualifyingDates } = require("./streakDays");
const { appYear, SQL } = require("./dates");

const SECRET_SECONDS = 3 * 60 * 60;

// Progreso actual de cada code de logro a partir de los datos del usuario.
// Regresa { progress: Map<code, número>, targets: Map<code, número|null> }.
// `targets` sobreescribe el umbral del catálogo para logros cuyo umbral depende
// del usuario (meta_anual usa el valor de su meta). null significa "sin
// objetivo": el logro no se puede desbloquear (p. ej. no hay meta configurada).
async function computeProgress(userId) {
  const progress = new Map();
  const targets = new Map();

  progress.set("en_racha", computeStreaks(await getQualifyingDates(userId)).best);

  const { rows: months } = await pool.query(
    `SELECT ${SQL.toChar("created_at", "YYYY-MM")} AS ym,
            COUNT(DISTINCT ${SQL.toChar()})::int AS n
     FROM reading_sessions
     WHERE user_id = $1
     GROUP BY 1`,
    [userId]
  );
  let perfectMonth = 0;
  for (const { ym, n } of months) {
    const [y, m] = ym.split("-").map(Number);
    if (n >= new Date(y, m, 0).getDate()) {
      perfectMonth = 1;
      break;
    }
  }
  progress.set("mes_perfecto", perfectMonth);

  const { rows: books } = await pool.query(
    `SELECT COUNT(DISTINCT book_id)::int AS n
     FROM user_books
     WHERE user_id = $1 AND status = 'completed'`,
    [userId]
  );
  progress.set("primer_libro", books[0].n);
  progress.set("raton_biblioteca", books[0].n);

  const { rows: pages } = await pool.query(
    `SELECT COALESCE(SUM(pages_read), 0)::int AS n
     FROM reading_sessions
     WHERE user_id = $1`,
    [userId]
  );
  progress.set("maratonista", pages[0].n);

  const { rows: weekendPages } = await pool.query(
    `SELECT COALESCE(SUM(pages_read), 0)::int AS n
     FROM reading_sessions
     WHERE user_id = $1 AND EXTRACT(ISODOW FROM ${SQL.utcToApp("created_at")}) IN (6, 7)`,
    [userId]
  );
  progress.set("maraton_fin_de_semana", weekendPages[0].n);

  const { rows: heavyRows } = await pool.query(
    `SELECT COUNT(DISTINCT ub.book_id)::int AS n
     FROM user_books ub
     JOIN books b ON b.id = ub.book_id
     WHERE ub.user_id = $1 AND ub.status = 'completed' AND b.pages >= 500`,
    [userId]
  );
  progress.set("tomo_pesado", heavyRows[0].n);

  const { rows: shortRows } = await pool.query(
    `SELECT COUNT(DISTINCT ub.book_id)::int AS n
     FROM user_books ub
     JOIN books b ON b.id = ub.book_id
     WHERE ub.user_id = $1 AND ub.status = 'completed' AND b.pages < 150`,
    [userId]
  );
  progress.set("lectura_expres", shortRows[0].n);

  const year = appYear();
  const { rows: goalRows } = await pool.query(
    "SELECT value FROM reading_goals WHERE user_id = $1 AND year = $2 AND type = 'annual'",
    [userId, year]
  );
  const { rows: yearRows } = await pool.query(
    `SELECT COUNT(*)::int AS n
     FROM user_books
     WHERE user_id = $1 AND status = 'completed' AND is_archived = FALSE
       AND EXTRACT(YEAR FROM finished_at) = $2`,
    [userId, year]
  );
  const annualGoal = goalRows[0]?.value ?? 0;
  progress.set("meta_anual", yearRows[0].n);
  targets.set("meta_anual", annualGoal > 0 ? annualGoal : null);

  const { rows: genreRows } = await pool.query(
    `SELECT COUNT(DISTINCT b.genre)::int AS n
     FROM books b
     JOIN user_books ub ON ub.book_id = b.id
     WHERE ub.user_id = $1 AND ub.status = 'completed'
       AND b.genre IS NOT NULL AND b.genre <> ''`,
    [userId]
  );
  progress.set("explorador", genreRows[0].n);

  const { rows: authorRows } = await pool.query(
    `SELECT COUNT(DISTINCT ub.book_id)::int AS n
     FROM books b
     JOIN user_books ub ON ub.book_id = b.id
     WHERE ub.user_id = $1 AND ub.status = 'completed'
       AND b.author IS NOT NULL AND b.author <> ''
     GROUP BY b.author
     ORDER BY n DESC
     LIMIT 1`,
    [userId]
  );
  progress.set("autor_fiel", authorRows[0]?.n ?? 0);

  const { rows: ratingRows } = await pool.query(
    `SELECT COUNT(DISTINCT book_id)::int AS n
     FROM user_books
     WHERE user_id = $1 AND rating IS NOT NULL`,
    [userId]
  );
  progress.set("critico", ratingRows[0].n);

  const { rows: noteRows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM notes WHERE user_id = $1",
    [userId]
  );
  progress.set("anotador", noteRows[0].n);

  const { rows: editRows } = await pool.query(
    "SELECT COUNT(*)::int AS n FROM achievement_events WHERE user_id = $1 AND code = 'retroalimentacion'",
    [userId]
  );
  progress.set("retroalimentacion", editRows[0].n);

  const { rows: abandRows } = await pool.query(
    `SELECT 1 AS hit
     WHERE EXISTS (SELECT 1 FROM achievement_events WHERE user_id = $1 AND code = 'abandono')
        OR EXISTS (SELECT 1 FROM user_books WHERE user_id = $1 AND status = 'abandoned')
     LIMIT 1`,
    [userId]
  );
  progress.set("abandono", abandRows[0] ? 1 : 0);

  const { rows: dedRows } = await pool.query(
    `SELECT 1 AS hit
     FROM (
       SELECT ${SQL.toChar()} AS d, SUM(duration_seconds) AS s
       FROM reading_sessions
       WHERE user_id = $1
       GROUP BY 1
     ) t
     WHERE s >= ${SECRET_SECONDS}
     LIMIT 1`,
    [userId]
  );
  progress.set("dedicacion", dedRows[0] ? 1 : 0);

  return { progress, targets };
}

// Re-evalúa todos los logros y desbloquea los que correspondan. Idempotente:
// INSERT ... ON CONFLICT DO NOTHING; retroactivo (cubre lo que ya se había
// hecho antes de existir el sistema). Acepta el resultado de computeProgress
// para no recalcular cuando ya se tiene. Regresa { progress, targets }.
async function recheckAchievements(userId, computed = null) {
  const data = computed ?? (await computeProgress(userId));
  const { progress, targets } = data;

  const { rows: catalog } = await pool.query(
    "SELECT code, tier, target FROM achievements"
  );

  const toInsert = [];
  for (const row of catalog) {
    const override = targets.has(row.code) ? targets.get(row.code) : undefined;
    const target = override === undefined ? row.target : override;
    const p = progress.get(row.code) ?? 0;
    if (target !== null && p >= target) toInsert.push([row.code, row.tier]);
  }

  let fresh = [];
  if (toInsert.length > 0) {
    const codes = toInsert.map(([c]) => c);
    const tiers = toInsert.map(([, t]) => t);
    const { rows } = await pool.query(
      `INSERT INTO user_achievements (user_id, code, tier)
       SELECT $1, c, t
       FROM unnest($2::text[], $3::text[]) AS u(c, t)
       ON CONFLICT DO NOTHING
       RETURNING code, tier, unlocked_at`,
      [userId, codes, tiers]
    );
    fresh = rows;
  }

  cache.delPrefix(`achievements:${userId}`);
  return { ...data, fresh };
}

// Datos de presentación (nombre, leyenda, icono, unlocked_at) de los logros
// recién desbloqueados, para que la app los celebre al instante sin esperar a
// que el usuario abra la pantalla de Logros. Si varios escalones del mismo
// logro caen a la vez, solo se celebra el más alto.
const TIER_WEIGHT = { bronze: 1, silver: 2, gold: 3, special: 4 };

async function freshAchievements(fresh) {
  if (!fresh || fresh.length === 0) return [];
  const best = new Map();
  for (const f of fresh) {
    const prev = best.get(f.code);
    if (!prev || (TIER_WEIGHT[f.tier] ?? 0) > (TIER_WEIGHT[prev.tier] ?? 0)) best.set(f.code, f);
  }
  const picked = [...best.values()];
  const { rows } = await pool.query(
    `SELECT a.code, a.tier, a.name, a.description, a.leyenda, a.icon
     FROM achievements a
     JOIN unnest($1::text[], $2::text[]) AS f(code, tier)
       ON a.code = f.code AND a.tier = f.tier`,
    [picked.map((f) => f.code), picked.map((f) => f.tier)]
  );
  const at = new Map(picked.map((f) => [`${f.code}:${f.tier}`, f.unlocked_at]));
  return rows.map((r) => ({ ...r, unlocked_at: at.get(`${r.code}:${r.tier}`) ?? null }));
}

// Adjunta `new_achievements` al payload solo si hubo desbloqueos nuevos.
async function withFreshAchievements(payload, recheckResult) {
  const items = await freshAchievements(recheckResult && recheckResult.fresh);
  return items.length ? { ...payload, new_achievements: items } : payload;
}

module.exports = { computeProgress, recheckAchievements, freshAchievements, withFreshAchievements };