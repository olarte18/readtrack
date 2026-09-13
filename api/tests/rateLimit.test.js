const express = require("express");
const request = require("supertest");
const { makeLimiter } = require("../src/middleware/rateLimit");

describe("rate limit (makeLimiter)", () => {
  let app;
  const original = process.env.RATE_LIMIT_DISABLED;

  beforeAll(() => {
    process.env.RATE_LIMIT_DISABLED = "false";
    app = express();
    app.get("/health", (req, res) => res.json({ status: "ok" }));
    app.use(makeLimiter({ max: 3, windowMs: 60000 }));
    app.get("/ping", (req, res) => res.json({ ok: true }));
  });

  afterAll(() => {
    process.env.RATE_LIMIT_DISABLED = original;
  });

  test("excluye /health del límite", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await request(app).get("/health");
      expect(res.status).toBe(200);
    }
  });

  test("devuelve 429 al superar el máximo", async () => {
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get("/ping");
      expect(res.status).toBe(200);
    }
    const blocked = await request(app).get("/ping");
    expect(blocked.status).toBe(429);
  });
});