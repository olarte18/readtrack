const express = require("express");
const router = express.Router();
const pool = require("../db/connection");
const authMiddleware = require("../middleware/auth");
const httpError = require("../utils/httpError");
const { validate } = require("../utils/validators");

router.use(authMiddleware);

// GET /notes/:book_id
router.get("/:book_id", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT * FROM notes WHERE book_id = $1 AND user_id = $2 ORDER BY created_at DESC",
    [req.params.book_id, req.userId]
  );
  res.json(rows);
});

// POST /notes
router.post("/", async (req, res) => {
  const data = validate(req.body, {
    book_id: { required: true, type: "integer", min: 1 },
    content: { required: true, type: "string", min: 1, max: 5000 },
    page: { type: "integer", min: 1 },
  });

  const { rows } = await pool.query(
    "INSERT INTO notes (book_id, user_id, content, page) VALUES ($1, $2, $3, $4) RETURNING *",
    [data.book_id, req.userId, data.content, data.page]
  );
  res.status(201).json(rows[0]);
});

// DELETE /notes/:id
router.delete("/:id", async (req, res) => {
  await pool.query("DELETE FROM notes WHERE id = $1 AND user_id = $2", [req.params.id, req.userId]);
  res.json({ message: "Nota eliminada" });
});

module.exports = router;