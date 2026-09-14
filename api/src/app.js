require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const booksRouter = require("./routes/books");
const userBooksRouter = require("./routes/userBooks");
const notesRouter = require("./routes/notes");
const authRouter = require("./routes/auth");
const statsRouter = require("./routes/stats");
const readingSessionsRouter = require("./routes/readingSessions");
const goalsRouter = require("./routes/goals");
const calendarRouter = require("./routes/calendar");
const importsRouter = require("./routes/imports");
const errorHandler = require("./middleware/errorHandler");
const { booksLimiter } = require("./middleware/rateLimit");
const pool = require("./db/connection");

if (!process.env.JWT_SECRET) {
  console.error("Falta JWT_SECRET en el entorno");
  process.exit(1);
}

const app = express();

// Render corre detrás de un proxy: sin esto `req.ip` es la IP del proxy para
// todos y express-rate-limit cuenta a toda la app como un solo usuario.
app.set("trust proxy", 1);

app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()) || false,
  credentials: true,
}));
app.use(express.json({ limit: "15mb" }));
app.use("/stats", statsRouter);
app.use("/auth", authRouter);
app.use("/books", booksLimiter);
app.use("/books", booksRouter);
app.use("/user-books", userBooksRouter);
app.use("/notes", notesRouter);
app.use("/reading-sessions", readingSessionsRouter);
app.use("/goals", goalsRouter);
app.use("/calendar", calendarRouter);
app.use("/import", importsRouter);
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    console.error("Health: no se pudo verificar la BD", err.message);
    res.status(503).json({ status: "error" });
  }
});

app.use(errorHandler);

module.exports = app;