const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/auth");
const { globalUserLimiter } = require("../middleware/rateLimit");
const cache = require("../utils/cache");
const { bucketReadingDays } = require("../utils/sessionDays");
const { reconcileProtectors, getShopState, buyProtector, rolloverSlots } = require("../utils/streakProtectors");

router.use(authMiddleware);
router.use(globalUserLimiter);

// GET /streak — estado de la tienda de protectores (puntos, ranuras, inventario).
router.get("/", async (req, res) => {
  const buckets = await bucketReadingDays(req.userId);
  await rolloverSlots(req.userId);
  await reconcileProtectors(req.userId, buckets);
  res.json(await getShopState(req.userId));
});

// POST /streak/buy — compra un protector con puntos.
router.post("/buy", async (req, res) => {
  const buckets = await bucketReadingDays(req.userId);
  await rolloverSlots(req.userId);
  await reconcileProtectors(req.userId, buckets);
  const state = await buyProtector(req.userId);
  // El saldo de puntos y el inventario afectan el chip de racha (stats/streak).
  cache.delPrefix(`stats:${req.userId}`);
  cache.delPrefix(`calendar:${req.userId}`);
  res.json(state);
});

module.exports = router;
