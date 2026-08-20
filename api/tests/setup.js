process.env.NODE_ENV = "test";
process.env.DB_NAME = process.env.DB_NAME || "readtrack_test";
process.env.JWT_SECRET = "test_secret";

const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
});

const schema = fs.readFileSync(path.join(__dirname, "..", "src", "db", "schema.sql"), "utf8");

beforeAll(async () => {
  await pool.query(schema);
});

afterAll(async () => {
  await pool.end();
});

module.exports = { pool };