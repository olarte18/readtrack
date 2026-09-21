process.env.NODE_ENV = "test";
process.env.DB_NAME = process.env.DB_NAME || "readtrack_test";
process.env.JWT_SECRET = "test_secret";
process.env.RATE_LIMIT_DISABLED = "true";
// La regla de racha rige desde una fecha lejana para que toda sesión creada en
// tests sea "nueva" y la suite verifique los mínimos reales (ver streakDays.js).
process.env.STREAK_RULE_SINCE = process.env.STREAK_RULE_SINCE || "2000-01-01 00:00:00";