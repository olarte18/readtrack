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

if (!process.env.JWT_SECRET) {
  console.error("Falta JWT_SECRET en el entorno");
  process.exit(1);
}

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "15mb" }));
app.use("/stats", statsRouter);
app.use("/auth", authRouter);
app.use("/books", booksRouter);
app.use("/user-books", userBooksRouter);
app.use("/notes", notesRouter);
app.use("/reading-sessions", readingSessionsRouter);
app.use("/goals", goalsRouter);
app.use("/calendar", calendarRouter);
app.use("/import", importsRouter);
app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use(errorHandler);

module.exports = app;