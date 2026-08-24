const jwt = require("jsonwebtoken");
const pool = require("../db/connection");

module.exports = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: "Token requerido" });

  const token = header.split(" ")[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // El token puede ser válido pero pertenecer a una cuenta eliminada
    const { rows } = await pool.query("SELECT 1 FROM users WHERE id = $1", [decoded.id]);
    if (rows.length === 0) return res.status(401).json({ error: "Sesión inválida" });

    req.userId = decoded.id;
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
};
