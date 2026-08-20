const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
require("dotenv").config();

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

async function main() {
  const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
  });
  try {
    await pool.query(schema);
    console.log(`Schema aplicado en ${process.env.DB_NAME}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});