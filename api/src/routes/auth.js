const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;

// POST /auth/register
router.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: "Todos los campos son requeridos" });

  try {
    const hashed = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users (username, email, password) VALUES ($1, $2, $3) RETURNING id, username, email",
      [username, email, hashed]
    );
    const token = jwt.sign({ id: rows[0].id }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ user: rows[0], token });
  } catch (error) {
    if (error.code === "23505") {
      return res.status(400).json({ error: "Email o usuario ya registrado" });
    }
    res.status(500).json({ error: "Error al registrar" });
  }
});

// POST /auth/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: "Email y contraseña requeridos" });

  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
    if (rows.length === 0)
      return res.status(401).json({ error: "Credenciales incorrectas" });

    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid)
      return res.status(401).json({ error: "Credenciales incorrectas" });

    const token = jwt.sign({ id: rows[0].id }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ user: { id: rows[0].id, username: rows[0].username, email: rows[0].email }, token });
  } catch (error) {
    res.status(500).json({ error: "Error al iniciar sesión" });
  }
});

module.exports = router;
