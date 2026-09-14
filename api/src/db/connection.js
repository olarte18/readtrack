const { Pool } = require("pg");
require("dotenv").config();
const { dbSsl } = require("./ssl");

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  ssl: dbSsl(),
  // Si la BD no responde, no dejar el request (o el /health) colgados hasta el
  // timeout del SO: fallar en 5s tampoco es aceptable para un health check.
  connectionTimeoutMillis: 5000,
});

module.exports = pool;
