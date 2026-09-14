const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const pool = require("../db/connection");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const httpError = require("../utils/httpError");
const { validate } = require("../utils/validators");
const { sendPasswordResetCode } = require("../utils/email");

const RESET_CODE_TTL_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;

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

// Anti spam de correos: pedir un código de recuperación (1 por flujo + reenvío)
const forgotLimiter =
  process.env.NODE_ENV === "test"
    ? bypassInTest
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 3,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Demasiados intentos, intenta más tarde" },
      });

// Anti fuerza bruta: validar/usar un código (verify + reset comparten el bucket)
const verifyResetLimiter =
  process.env.NODE_ENV === "test"
    ? bypassInTest
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 10,
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

// Hash dummy para que las comparaciones de código tarden lo mismo exista o no el email
const DUMMY_CODE_HASH = bcrypt.hashSync("000000", 10);

function generateResetCode() {
  return crypto.randomInt(0, 1000000).toString().padStart(6, "0");
}

async function createResetCode(userId) {
  const code = generateResetCode();
  const hashed = await bcrypt.hash(code, 10);
  // Un solo código activo por usuario: invalida los anteriores sin usar
  await pool.query(
    "UPDATE verification_codes SET used = true WHERE user_id = $1 AND type = 'password_reset' AND used = false",
    [userId]
  );
  await pool.query(
    `INSERT INTO verification_codes (user_id, code, type, expires_at)
     VALUES ($1, $2, 'password_reset', $3)`,
    [userId, hashed, new Date(Date.now() + RESET_CODE_TTL_MINUTES * 60 * 1000)]
  );
  return code;
}

async function findActiveResetCode(userId) {
  const { rows } = await pool.query(
    `SELECT id, code, user_id FROM verification_codes
     WHERE user_id = $1 AND type = 'password_reset' AND used = false
       AND expires_at > NOW() AND attempts < $2
     ORDER BY id DESC LIMIT 1`,
    [userId, MAX_CODE_ATTEMPTS]
  );
  return rows[0] || null;
}

// Devuelve la fila del código si el código es válido para ese email, si no null.
// Siempre ejecuta un bcrypt.compare (contra un hash dummy si no hay usuario/código)
// para no filtrar la existencia del email por el tiempo de respuesta.
// Un intento fallido consume un intento del código (columna `attempts`): tras
// MAX_CODE_ATTEMPTS el código queda bloqueado aunque la IP cambie.
async function checkResetCode(email, code) {
  const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  const user = rows[0];
  const active = user ? await findActiveResetCode(user.id) : null;
  const valid = await bcrypt.compare(code, active ? active.code : DUMMY_CODE_HASH);
  if (valid) return active;
  if (active) {
    await pool.query("UPDATE verification_codes SET attempts = attempts + 1 WHERE id = $1", [active.id]);
  }
  return null;
}

const resetCodeSchema = {
  email: { required: true, type: "email" },
  code: { required: true, type: "string", min: 6, max: 6 },
};

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

// POST /auth/forgot-password — genera un código de 6 dígitos y lo envía por email.
// Responde lo mismo exista o no el email (no enumera usuarios).
router.post("/forgot-password", forgotLimiter, async (req, res) => {
  const { email } = validate(req.body, { email: { required: true, type: "email" } });
  const normalized = email.toLowerCase();

  const { rows } = await pool.query("SELECT id FROM users WHERE email = $1", [normalized]);
  if (rows.length > 0) {
    const code = await createResetCode(rows[0].id);
    await sendPasswordResetCode(normalized, code);
  } else {
    await bcrypt.hash("000000", 10); // mismo costo aproximado que el caso real
  }

  res.json({ ok: true });
});

// POST /auth/verify-reset-code — valida el código sin consumirlo
router.post("/verify-reset-code", verifyResetLimiter, async (req, res) => {
  const data = validate(req.body, resetCodeSchema);
  if (!/^\d{6}$/.test(data.code)) throw httpError(400, "Código inválido o expirado");
  const row = await checkResetCode(data.email.toLowerCase(), data.code);
  if (!row) throw httpError(400, "Código inválido o expirado");
  res.json({ ok: true });
});

// POST /auth/reset-password — cambia la contraseña, consume el código y revoca
// todas las sesiones del usuario (invalida los refresh tokens existentes).
router.post("/reset-password", verifyResetLimiter, async (req, res) => {
  const data = validate(req.body, {
    ...resetCodeSchema,
    newPassword: { required: true, type: "string", min: 6, max: 100 },
  });
  if (!/^\d{6}$/.test(data.code)) throw httpError(400, "Código inválido o expirado");

  const row = await checkResetCode(data.email.toLowerCase(), data.code);
  if (!row) throw httpError(400, "Código inválido o expirado");

  const hashed = await bcrypt.hash(data.newPassword, 10);
  await pool.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, row.user_id]);
  await pool.query("UPDATE verification_codes SET used = true WHERE id = $1", [row.id]);
  await pool.query(
    "UPDATE verification_codes SET used = true WHERE user_id = $1 AND type = 'password_reset' AND used = false",
    [row.user_id]
  );
  await pool.query(
    "UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL",
    [row.user_id]
  );

  res.json({ ok: true });
});

module.exports = router;