require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const request = require("supertest");

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

const schema = fs.readFileSync(path.join(__dirname, "..", "src", "db", "schema.sql"), "utf8");
const app = require("../src/app");

const TABLES = ["verification_codes", "reading_sessions", "reading_goals", "notes", "user_books", "books", "users"];

async function initDb() {
  await pool.query(schema);
}

async function resetDb() {
  await pool.query(`TRUNCATE ${TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

async function closeDb() {
  await pool.end();
  await require("../src/db/connection").end();
}

async function registerUser(overrides = {}) {
  const payload = {
    username: "usuario_test",
    email: "test@example.com",
    password: "password123",
    ...overrides,
  };
  const res = await request(app).post("/auth/register").send(payload);
  return res.body;
}

function authHeader(token) {
  return { Authorization: `Bearer ${token}` };
}

module.exports = { app, request, pool, initDb, resetDb, closeDb, registerUser, authHeader };