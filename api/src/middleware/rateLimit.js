const rateLimit = require("express-rate-limit");

const MESSAGE = { error: "Demasiadas peticiones, intenta más tarde" };
const DEFAULT_WINDOW = 15 * 60 * 1000; // 15 min

// Desactivar en tests vía setupEnv (RATE_LIMIT_DISABLED=true) para no romper la suite.
function makeLimiter({ max, windowMs = DEFAULT_WINDOW, keyBy = "ip", skip } = {}) {
  return rateLimit({
    windowMs: Number(windowMs),
    max: Number(max),
    standardHeaders: true,
    legacyHeaders: false,
    message: MESSAGE,
    keyGenerator: keyBy === "userId" ? (req) => `u:${req.userId}` : undefined,
    skip: (req, res) => {
      if (process.env.RATE_LIMIT_DISABLED === "true") return true;
      if (req.method === "GET" && req.path === "/health") return true;
      if (typeof skip === "function") return skip(req, res);
      return false;
    },
  });
}

// Rutas públicas de /books (search golpea Google Books / Open Library). Por IP.
const booksLimiter = makeLimiter({
  max: process.env.RATE_LIMIT_BOOKS || 60,
  windowMs: process.env.RATE_LIMIT_WINDOW_MS,
});

// Rutas autenticadas: clave por usuario (no IP) para que usuarios detrás de un
// mismo NAT no se bloqueen entre sí. Requiere authMiddleware ANTES.
const globalUserLimiter = makeLimiter({
  max: process.env.RATE_LIMIT_MAX || 300,
  windowMs: process.env.RATE_LIMIT_WINDOW_MS,
  keyBy: "userId",
});

// /import acepta payloads de 10–20 MB: límite más estricto, por usuario.
const importLimiter = makeLimiter({
  max: 20,
  windowMs: process.env.RATE_LIMIT_WINDOW_MS,
  keyBy: "userId",
});

module.exports = { makeLimiter, booksLimiter, globalUserLimiter, importLimiter };