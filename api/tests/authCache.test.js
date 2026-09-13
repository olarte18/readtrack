const express = require("express");
const request = require("supertest");
const authMiddleware = require("../src/middleware/auth");
const cache = require("../src/utils/cache");
const db = require("../src/db/connection");
const { registerUser, authHeader, pool, resetDb } = require("./helpers");

describe("authMiddleware con caché de existencia de usuario", () => {
  let app;

  beforeAll(() => {
    cache.setEnabled(true);
    app = express();
    app.get("/protected", authMiddleware, (req, res) => res.json({ userId: req.userId }));
  });

  afterAll(() => {
    cache.setEnabled(false);
  });

  beforeEach(async () => {
    await resetDb();
  });

  test("el segundo request con el mismo usuario no vuelve a consultar la BD", async () => {
    const { token } = await registerUser();
    const spy = jest.spyOn(db, "query");

    await request(app).get("/protected").set(authHeader(token));
    const callsAfterFirst = spy.mock.calls.length;

    await request(app).get("/protected").set(authHeader(token));
    expect(spy.mock.calls.length).toBe(callsAfterFirst);

    spy.mockRestore();
  });

  test("rechaza el token si la cuenta fue eliminada y la caché está vencida", async () => {
    const { token, user } = await registerUser();
    const ok = await request(app).get("/protected").set(authHeader(token));
    expect(ok.status).toBe(200);

    cache.delPrefix(`auth:user:${user.id}`);
    await pool.query("DELETE FROM users WHERE id = $1", [user.id]);

    const res = await request(app).get("/protected").set(authHeader(token));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Sesión inválida");
  });
});