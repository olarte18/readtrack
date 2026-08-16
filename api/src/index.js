require("dotenv").config();
const express = require("express");
const cors = require("cors");
const booksRouter = require("./routes/books");
const userBooksRouter = require("./routes/userBooks");

const app = express();
app.use(cors());
app.use(express.json());

app.use("/books", booksRouter);
app.use("/user-books", userBooksRouter);

app.get("/health", (req, res) => res.json({ status: "ok" }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`));