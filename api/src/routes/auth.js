const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const httpError = require("../utils/httpError");
const { validate } = require("../utils/validators");

const JWT_SECRET = process.env.JWT_SECRET;

const authLimiter =
  process.env.NODE_ENV === "test"
    ? (req, res, next) => next()
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 5,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Demasiados intentos, intenta más tarde" },
      });

const signToken = (id) => jwt.sign({ id }, JWT_SECRET, { expiresIn: "7d" });

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
  res.status(201).json({ user: rows[0], token: signToken(rows[0].id) });
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
  res.json({ user, token: signToken(rows[0].id) });
});

module.exports = router;