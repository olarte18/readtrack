process.env.NODE_ENV = "test";
process.env.DB_NAME = process.env.DB_NAME || "readtrack_test";
process.env.JWT_SECRET = "test_secret";

module.exports = async () => {
  const { initDb, closeDb } = require("./helpers");
  await initDb();
  await closeDb();
};