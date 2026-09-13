const jwt = require("jsonwebtoken");
const pool = require("../db/connection");
const cache = require("../utils/cache");

const USER_CACHE_TTL_MS = 60_000;

module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Token requerido" });

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // La cuenta pudo eliminarse: se valida contra la BD una vez por minuto y el
    // resto de requests salen de la caché (antes: 1 SELECT por cada request
    // autenticado). Si algún día existe DELETE /users, invalidar con
    // cache.delPrefix("auth:user:" + id) — la ventana residual es <= 60s.
    const cacheKey = `auth:user:${decoded.id}`;
    if (!cache.get(cacheKey)) {
      const { rows } = await pool.query("SELECT 1 FROM users WHERE id = $1", [decoded.id]);
      if (rows.length === 0) return res.status(401).json({ error: "Sesión inválida" });
      cache.set(cacheKey, true, USER_CACHE_TTL_MS);
    }

    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
};
