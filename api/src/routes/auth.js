const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const pool = require("../db/connection");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const httpError = require("../utils/httpError");
const { validate } = require("../utils/validators");

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TTL = process.env.JWT_ACCESS_EXPIRES || "2h";
const REFRESH_TTL_SECONDS = Number(process.env.JWT_REFRESH_EXPIRES_DAYS || 30) * 24 * 60 * 60;

const bypassInTest =
  (req, res, next) => next();

const authLimiter =
  process.env.NODE_ENV === "test"
    ? bypassInTest
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Demasiados intentos, intenta más tarde" },
      });

const refreshLimiter =
  process.env.NODE_ENV === "test"
    ? bypassInTest
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 60,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Demasiados intentos, intenta más tarde" },
      });

const signAccessToken = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: ACCESS_TTL });

const hashRefresh = (token) => crypto.createHash("sha256").update(token).digest("hex");

async function issueRefreshToken(userId) {
  const token = crypto.randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000);
  const { rows } = await pool.query(
    "INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3) RETURNING id",
    [userId, hashRefresh(token), expiresAt]
  );
  return { token, id: rows[0].id };
}

async function revokeRefreshToken(id, replacedById = null) {
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by_id = $2 WHERE id = $1 AND revoked_at IS NULL",
    [id, replacedById]
  );
}

async function findValidRefreshToken(rawToken) {
  const { rows } = await pool.query(
    `SELECT id, user_id FROM refresh_tokens
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()`,
    [hashRefresh(rawToken)]
  );
  return rows[0];
}

// POST /auth/register
router.post("/register", authLimiter, async (req, res) => {
  const data = validate(req.body, {
    username: { required: true, type: "string", max: 50 },
    email: { required: true, type: "email" },
    password: { required: true, type: "string", min: 6, max: 100 },
  });

  const hashed = await bcrypt.hash(data.password, 10);
  const { rows } = await pool.query(
    "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email",
    [data.username.trim(), data.email.toLowerCase(), hashed]
  );
  const refresh = await issueRefreshToken(rows[0].id);
  res.status(201).json({
    user: rows[0],
    token: signAccessToken(rows[0].id),
    refreshToken: refresh.token,
  });
});

// POST /auth/login
router.post("/login", authLimiter, async (req, res) => {
  const data = validate(req.body, {
    email: { required: true, type: "email" },
    password: { required: true, type: "string" },
  });

  const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [data.email.toLowerCase()]);
  if (rows.length === 0) throw httpError(401, "Credenciales incorrectas");

  const valid = await bcrypt.compare(data.password, rows[0].password);
  if (!valid) throw httpError(401, "Credenciales incorrectas");

  const user = { id: rows[0].id, username: rows[0].username, email: rows[0].email };
  const refresh = await issueRefreshToken(user.id);
  res.json({ user, token: signAccessToken(user.id), refreshToken: refresh.token });
});

// POST /auth/refresh — rota el refresh token y emite un access token nuevo
router.post("/refresh", refreshLimiter, async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw httpError(400, "refreshToken es requerido");

  const row = await findValidRefreshToken(refreshToken);
  if (!row) throw httpError(401, "Sesión expirada, inicia sesión de nuevo");

  const next = await issueRefreshToken(row.user_id);
  await revokeRefreshToken(row.id, next.id);
  res.json({ token: signAccessToken(row.user_id), refreshToken: next.token });
});

// POST /auth/logout — revoca el refresh token en uso
router.post("/logout", async (req, res) => {
  const { refreshToken } = req.body;
  if (refreshToken) {
    const row = await findValidRefreshToken(refreshToken);
    if (row) await revokeRefreshToken(row.id);
  }
  res.json({ ok: true });
});

module.exports = router;