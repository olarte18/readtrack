const fs = require("fs");
const path = require("path");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

// Aplica el esquema de forma idempotente (todo usa IF NOT EXISTS / ADD COLUMN
// IF NOT EXISTS), seguro para ejecutar en cada arranque del servidor.
async function applySchema(pool) {
  await pool.query(schema);
}

async function main() {
  require("dotenv").config();
  const { Pool } = require("pg");
  const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : undefined,
  });
  try {
    await applySchema(pool);
    console.log(`Schema aplicado en ${process.env.DB_NAME}`);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { applySchema };
