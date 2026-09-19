const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const { globalUserLimiter } = require("../middleware/rateLimit");
const cache = require("../utils/cache");
const { recheckAchievements } = require("../utils/achievements");

router.use(authMiddleware);
router.use(globalUserLimiter);

const GROUP_LABELS = {
  rachas: "Rachas",
  volumen: "Volumen",
  variedad: "Variedad",
  interaccion: "Interacción",
  secretos: "Secretos",
};

const TIER_WEIGHT = { bronze: 1, silver: 2, gold: 3, special: 4 };

// GET /achievements — catálogo con progreso y desbloqueos. Recalcula primero
// (idempotente y retroactivo). Los logros secretos solo aparecen al
// desbloquearse; los grupos que quedan vacíos se omiten.
router.get("/", async (req, res) => {
  const cacheKey = `achievements:${req.userId}`;
  const cached = cache.get(cacheKey);
  if (cached) return res.json(cached);

  const { progress, targets } = await recheckAchievements(req.userId);

  const [catalogRes, unlockedRes, unseenRes] = await Promise.all([
    pool.query(
      `SELECT code, tier, name, description, leyenda, icon, grp, target, is_secret, sort_order
       FROM achievements
       ORDER BY grp, sort_order`
    ),
    pool.query(
      "SELECT code, tier, unlocked_at, seen_at FROM user_achievements WHERE user_id = $1",
      [req.userId]
    ),
    pool.query(
      "SELECT COUNT(*)::int AS n FROM user_achievements WHERE user_id = $1 AND seen_at IS NULL",
      [req.userId]
    ),
  ]);

  const unlocked = new Map(unlockedRes.rows.map((r) => [`${r.code}:${r.tier}`, r]));

// Una insignia por code: se muestra el tier más alto desbloqueado (o el
// primero si ninguno) y, si queda un escalón superior no secreto, `target`
// es ese umbral con `next_tier: true` para que la app muestre cuánto falta.
// Los escalones finales (is_secret) nunca se revelan: no se muestra su target
// ni cuánto falta hasta que se desbloquean.
const tiersByCode = new Map();
  for (const a of catalogRes.rows) {
    if (!tiersByCode.has(a.code)) tiersByCode.set(a.code, []);
    tiersByCode.get(a.code).push(a);
  }

  const groups = new Map();
  for (const tiers of tiersByCode.values()) {
    tiers.sort((x, y) => x.target - y.target);
    const code = tiers[0].code;
    const unlockedAny = tiers.some((t) => unlocked.has(`${code}:${t.tier}`));
    if (tiers[0].is_secret && !unlockedAny) continue;

    // El tier mostrado es el más alto desbloqueado (tiers está ordenado asc).
    let display = tiers[0];
    for (const t of tiers) {
      if (unlocked.has(`${code}:${t.tier}`)) display = t;
    }

    const u = unlocked.get(`${code}:${display.tier}`);
    let next = null;
    const displayIdx = tiers.findIndex((t) => t.tier === display.tier);
    const nextTier = unlockedAny && displayIdx + 1 < tiers.length ? tiers[displayIdx + 1] : null;
    if (nextTier && !nextTier.is_secret) next = nextTier;

    const override = targets.has(code) ? targets.get(code) : undefined;
    const target = override === undefined ? (next ? next.target : display.target) : override;

    if (!groups.has(display.grp)) {
      groups.set(display.grp, { code: display.grp, label: GROUP_LABELS[display.grp] ?? display.grp, items: [] });
    }
    groups.get(display.grp).items.push({
      code,
      tier: display.tier,
      name: display.name,
      description: display.description,
      leyenda: display.leyenda ?? null,
      icon: display.icon,
      target,
      progress: progress.get(code) ?? 0,
      unlocked: !!u,
      unlocked_at: u ? u.unlocked_at : null,
      seen: u ? !!u.seen_at : false,
      next_tier: !!next,
      sort_order: display.sort_order,
    });
  }

  const payload = {
    unseen_count: unseenRes.rows[0]?.n,
    groups: [...groups.values()].map((g) => ({
      ...g,
      items: [...g.items].sort((x, y) => TIER_WEIGHT[x.tier] - TIER_WEIGHT[y.tier]),
    })),
  };
  cache.set(cacheKey, payload, 60000);
  res.json(payload);
});

// POST /achievements/seen — marcar todos los desbloqueos como vistos.
router.post("/seen", async (req, res) => {
  const { rowCount } = await pool.query(
    "UPDATE user_achievements SET seen_at = NOW() WHERE user_id = $1 AND seen_at IS NULL",
    [req.userId]
  );
  cache.delPrefix(`achievements:${req.userId}`);
  res.json({ ok: true, marked: rowCount });
});

module.exports = router;