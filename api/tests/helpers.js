require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const request = require("supertest");

if (!process.env.TEST_DATABASE_URL) {
  console.error("TEST_DATABASE_URL is required for tests. Refusing to run against any other database.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });

const schema = fs.readFileSync(path.join(__dirname, "..", "src", "db", "schema.sql"), "utf8");
const app = require("../src/app");

const TABLES = ["refresh_tokens", "verification_codes", "reading_sessions", "reading_goals", "notes", "user_books", "books", "users"];

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