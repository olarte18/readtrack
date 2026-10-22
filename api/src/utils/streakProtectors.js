const pool = require("../db/connection");
const { SQL } = require("./dates");
const { getQualifyingDates, appToday } = require("./streakDays");
const httpError = require("./httpError");
const { ensureGift, getBalance, PROTECTOR_COST } = require("./streakPoints");

// Ranuras de inventario: base 2, máximo 4.
const SLOTS_BASE = Number(process.env.STREAK_SLOTS_BASE || 2);
const SLOTS_MAX = Number(process.env.STREAK_SLOTS_MAX || 4);

// Solo se rescatan huecos recientes (una racha rota hace meses ya no importa y
// gastar un protector retroactivo sorprendería al usuario).
const RECONCILE_WINDOW_DAYS = 30;

const DAY_MS = 86400000;

function addDays(dateStr, n) {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}
function diffDays(a, b) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}
// Suma n meses a un 'YYYY-MM' (aritmética pura, sin zonas horarias).
function addMonths(ym, n) {
  const [y, m] = ym.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${String(Math.floor(total / 12)).padStart(4, "0")}-${String((total % 12) + 1).padStart(2, "0")}`;
}

// Fechas (YYYY-MM-DD Bogotá) ya cubiertas por un protector consumido.
async function getProtectedDates(userId) {
  const { rows } = await pool.query(
    `SELECT TO_CHAR(protected_date, 'YYYY-MM-DD') AS d
     FROM streak_protectors
     WHERE user_id = $1 AND protected_date IS NOT NULL`,
    [userId]
  );
  return rows.map((r) => r.d);
}

// Al cerrar un mes con 0 protectores usados y el inventario lleno, sube +1 ranura
// (hasta SLOTS_MAX). Usar un protector vuelve las ranuras a SLOTS_BASE, así que
// un mes con uso deja las ranuras en la base. Evalúa perezosamente (sin cron) los
// meses ya cerrados desde la última evaluación. Devuelve las ranuras actuales.
async function rolloverSlots(userId) {
  await pool.query(
    "INSERT INTO streak_protector_state (user_id, slots) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [userId, SLOTS_BASE]
  );

  const { rows: state } = await pool.query(
    `SELECT slots,
            TO_CHAR(last_eval_month, 'YYYY-MM') AS last_eval_ym,
            TO_CHAR(date_trunc('month', ${SQL.nowInApp()}), 'YYYY-MM') AS now_ym
     FROM streak_protector_state WHERE user_id = $1`,
    [userId]
  );
  const st = state[0];
  if (!st) return SLOTS_BASE;

  const lastClosed = addMonths(st.now_ym, -1); // último mes completo

  const { rows: usedRows } = await pool.query(
    `SELECT TO_CHAR(${SQL.utcToApp("used_at")}, 'YYYY-MM') AS ym, COUNT(*)::int AS n
     FROM streak_protectors WHERE user_id = $1 AND used_at IS NOT NULL GROUP BY 1`,
    [userId]
  );
  const { rows: boughtRows } = await pool.query(
    `SELECT TO_CHAR(${SQL.utcToApp("bought_at")}, 'YYYY-MM') AS ym, COUNT(*)::int AS n
     FROM streak_protectors WHERE user_id = $1 GROUP BY 1`,
    [userId]
  );
  const usedMap = new Map(usedRows.map((r) => [r.ym, r.n]));
  const boughtMap = new Map(boughtRows.map((r) => [r.ym, r.n]));

  let startYm;
  if (st.last_eval_ym) {
    startYm = addMonths(st.last_eval_ym, 1);
  } else {
    // Primera evaluación: desde la primera actividad registrada (o el último mes
    // cerrado si aún no hay protectores).
    const months = [...new Set([...usedMap.keys(), ...boughtMap.keys()])].sort();
    startYm = months.length ? months[0] : lastClosed;
  }

  const sumLE = (map, ym) => {
    let s = 0;
    for (const [k, v] of map) if (k <= ym) s += v;
    return s;
  };

  let slots = st.slots;
  let iterations = 0;
  for (let ym = startYm; ym <= lastClosed && iterations < 240; ym = addMonths(ym, 1)) {
    iterations++;
    const inventoryEnd = sumLE(boughtMap, ym) - sumLE(usedMap, ym);
    const usedInMonth = usedMap.get(ym) ?? 0;
    if (usedInMonth > 0) {
      slots = SLOTS_BASE;
    } else if (inventoryEnd >= slots) {
      slots = Math.min(SLOTS_MAX, slots + 1);
    }
  }

  await pool.query(
    "UPDATE streak_protector_state SET slots = $2, last_eval_month = $3::date WHERE user_id = $1",
    [userId, slots, `${lastClosed}-01`]
  );
  return slots;
}

// Huecos de un día que vale la pena proteger: se recorre hacia atrás el tramo de
// días con lectura real que sigue VIVO. Si la última lectura fue anteayer, ayer es
// un hueco pendiente que puede protegerse al abrir la app hoy, sin esperar otra
// sesión. Si la última lectura es más antigua, la racha ya se perdió. Un tramo
// roto por dos días o más no se puede unir con un solo protector: ahí se corta.
// Devuelve las fechas del hueco ordenadas de la más reciente a la más antigua.
function requiredGaps(realDates, today, windowStart) {
  const dates = [...new Set(realDates)].sort();
  if (dates.length === 0) return [];

  const yesterday = addDays(today, -1);
  let i = dates.length - 1;
  const gaps = [];

  while (i >= 0 && dates[i] < yesterday) i--;
  if (i < 0) {
    const dayBeforeYesterday = addDays(today, -2);
    const latestDate = dates[dates.length - 1];
    if (latestDate !== dayBeforeYesterday || yesterday < windowStart) return [];
    // Hoy es el primer día posterior al fallo. Proteger ayer conserva la racha
    // hasta hoy, aunque todavía no exista una sesión de hoy que cierre el hueco.
    gaps.push(yesterday);
    i = dates.length - 1;
  }

  let cursor = dates[i];
  for (let j = i - 1; j >= 0; j--) {
    const prev = dates[j];
    const d = diffDays(prev, cursor);
    if (d === 1) {
      cursor = prev;
      continue;
    }
    if (d === 2) {
      const middle = addDays(prev, 1);
      if (middle < windowStart) break;
      gaps.push(middle);
      cursor = prev;
      continue;
    }
    break; // hueco de 2+ días: un protector no lo une.
  }
  return gaps;
}

// Reparación única (por usuario) del bug anterior: devuelve los protectores que
// quedaron gastados en huecos que no conectan con la racha vigente (p. ej. una
// racha ya perdida). Se marca en `repaired_at` para no volver a devolver nada: a
// partir de ahí rige "una vez usado, siempre gastado".
async function repairOnce(userId, requiredSet) {
  await pool.query(
    "INSERT INTO streak_protector_state (user_id, slots) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [userId, SLOTS_BASE]
  );
  const { rows: st } = await pool.query(
    "SELECT repaired_at FROM streak_protector_state WHERE user_id = $1",
    [userId]
  );
  if (st[0]?.repaired_at) return;

  const { rows: usedRows } = await pool.query(
    `SELECT id, TO_CHAR(protected_date, 'YYYY-MM-DD') AS pd
     FROM streak_protectors
     WHERE user_id = $1 AND used_at IS NOT NULL`,
    [userId]
  );
  const toRelease = usedRows
    .filter((r) => !r.pd || !requiredSet.has(r.pd))
    .map((r) => r.id);
  if (toRelease.length > 0) {
    await pool.query(
      `UPDATE streak_protectors
       SET used_at = NULL, protected_date = NULL
       WHERE user_id = $1 AND id = ANY($2::int[])`,
      [userId, toRelease]
    );
  }
  await pool.query(
    "UPDATE streak_protector_state SET repaired_at = NOW() WHERE user_id = $1",
    [userId]
  );
}

// Cubre huecos vivos con los protectores disponibles. Solo CONSUME (nunca
// devuelve): un protector gastado en un hueco válido se queda gastado. Al consumir
// un hueco nuevo, las ranuras vuelven a la base. Devuelve cuántos huecos cubrió.
async function reconcileProtectors(userId, buckets = null) {
  await ensureGift(userId);
  const realDates = await getQualifyingDates(userId, buckets);
  const today = await appToday();
  const windowStart = addDays(today, -RECONCILE_WINDOW_DAYS);
  const required = requiredGaps(realDates, today, windowStart);
  const requiredSet = new Set(required);

  await repairOnce(userId, requiredSet);

  const { rows: usedRows } = await pool.query(
    `SELECT TO_CHAR(protected_date, 'YYYY-MM-DD') AS pd
     FROM streak_protectors
     WHERE user_id = $1 AND used_at IS NOT NULL`,
    [userId]
  );
  const covered = new Set(usedRows.map((r) => r.pd).filter(Boolean));
  const missing = required.filter((d) => !covered.has(d));

  let used = 0;
  if (missing.length > 0) {
    const { rows: avail } = await pool.query(
      `SELECT id FROM streak_protectors
       WHERE user_id = $1 AND used_at IS NULL
       ORDER BY (source = 'gift'), bought_at ASC, id ASC`,
      [userId]
    );
    for (const date of missing) {
      if (used >= avail.length) break;
      const { rowCount } = await pool.query(
        `UPDATE streak_protectors
         SET used_at = NOW(), protected_date = $2::date
         WHERE id = $1 AND used_at IS NULL`,
        [avail[used].id, date]
      );
      if (rowCount > 0) used++;
    }
  }

  if (used > 0) {
    await pool.query(
      "UPDATE streak_protector_state SET slots = $2 WHERE user_id = $1",
      [userId, SLOTS_BASE]
    );
  }
  return used;
}

// Estado compacto para el chip de la pantalla de lectura.
async function getProtectorSummary(userId) {
  await ensureGift(userId);
  const slots = await rolloverSlots(userId);
  const { rows } = await pool.query(
    `SELECT COUNT(*) FILTER (WHERE used_at IS NULL)::int AS available
     FROM streak_protectors WHERE user_id = $1`,
    [userId]
  );
  return { available: rows[0].available, slots };
}

// Estado completo para la tienda.
async function getShopState(userId) {
  await ensureGift(userId);
  const slots = await rolloverSlots(userId);
  const { rows } = await pool.query(
    `SELECT
       COUNT(*) FILTER (WHERE used_at IS NULL)::int AS owned,
       COUNT(*) FILTER (WHERE source = 'gift' AND used_at IS NULL)::int AS gift,
       COUNT(*) FILTER (
         WHERE used_at IS NOT NULL
           AND TO_CHAR(${SQL.utcToApp("used_at")}, 'YYYY-MM')
             = TO_CHAR(${SQL.nowInApp()}, 'YYYY-MM')
       )::int AS used_this_month
     FROM streak_protectors WHERE user_id = $1`,
    [userId]
  );
  const balance = await getBalance(userId);
  const row = rows[0];
  const canBuy = Math.max(0, Math.min(slots - row.owned, Math.floor(balance / PROTECTOR_COST)));
  return {
    points: balance,
    cost: PROTECTOR_COST,
    slots,
    owned: row.owned,
    can_buy: canBuy,
    gift_available: row.gift > 0,
    used_this_month: row.used_this_month,
  };
}

// Compra un protector con puntos. En transacción para evitar dobles compras
// simultáneas (verifica ranuras y saldo dentro de la misma operación).
async function buyProtector(userId) {
  await ensureGift(userId);
  const slots = await rolloverSlots(userId);

  const client = await pool.connect();
  let committed = false;
  try {
    await client.query("BEGIN");
    const { rows: cnt } = await client.query(
      "SELECT COUNT(*) FILTER (WHERE used_at IS NULL)::int AS owned FROM streak_protectors WHERE user_id = $1",
      [userId]
    );
    if (cnt[0].owned >= slots) throw httpError(409, "Ya tienes todas tus ranuras ocupadas");
    const { rows: bal } = await client.query(
      "SELECT COALESCE(SUM(delta), 0)::int AS balance FROM streak_point_events WHERE user_id = $1",
      [userId]
    );
    if (bal[0].balance < PROTECTOR_COST) throw httpError(400, "No tienes puntos suficientes");
    await client.query(
      "INSERT INTO streak_protectors (user_id, source, cost) VALUES ($1, 'buy', $2)",
      [userId, PROTECTOR_COST]
    );
    await client.query(
      "INSERT INTO streak_point_events (user_id, delta, reason) VALUES ($1, $2, 'spend')",
      [userId, -PROTECTOR_COST]
    );
    await client.query("COMMIT");
    committed = true;
  } catch (err) {
    if (!committed) {
      try {
        await client.query("ROLLBACK");
      } catch {}
    }
    throw err;
  } finally {
    client.release();
  }

  return getShopState(userId);
}

module.exports = {
  SLOTS_BASE,
  SLOTS_MAX,
  getProtectedDates,
  rolloverSlots,
  reconcileProtectors,
  getProtectorSummary,
  getShopState,
  buyProtector,
};
