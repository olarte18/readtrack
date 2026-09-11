const fs = require("fs");
const path = require("path");
require("dotenv").config();
const { dbSsl } = require("./ssl");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");

// Aplica el esquema de forma idempotente (todo usa IF NOT EXISTS / ADD COLUMN
// IF NOT EXISTS). Solo debe ejecutarse manualmente vía `npm run db:setup`.
async function applySchema(pool) {
  await pool.query(schema);
}

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SCHEMA_ON_PROD !== "true") {
    console.error("Refusing to apply schema in production. Set ALLOW_SCHEMA_ON_PROD=true to override.");
    process.exit(1);
  }
  const { Pool } = require("pg");
  const pool = new Pool({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    ssl: dbSsl(),
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