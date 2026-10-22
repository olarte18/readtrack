const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const { globalUserLimiter } = require("../middleware/rateLimit");
const { validate } = require("../utils/validators");
const httpError = require("../utils/httpError");
const { sendFeedbackEmail } = require("../utils/email");

router.use(authMiddleware);
router.use(globalUserLimiter);

router.post("/", async (req, res) => {
  const { message } = validate(req.body, {
    message: { required: true, type: "string", min: 1, max: 2000 },
  });
  const { rows } = await pool.query("SELECT username, email FROM users WHERE id = $1", [req.userId]);
  if (!rows[0]) throw httpError(401, "Sesión inválida");

  try {
    await sendFeedbackEmail({
      to: process.env.FEEDBACK_EMAIL || "soporte@readtrack.online",
      feedback: message,
      userEmail: rows[0].email,
      username: rows[0].username,
    });
  } catch (err) {
    console.error("[feedback] No se pudo enviar la sugerencia:", err.message);
    throw httpError(502, "No se pudo enviar la sugerencia. Inténtalo más tarde.");
  }

  res.json({ message: "Sugerencia enviada" });
});

module.exports = router;
