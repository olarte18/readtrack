const { app, request, closeDb } = require("./helpers");
const dbPool = require("../src/db/connection");

afterAll(closeDb);

describe("GET /health verifica la BD", () => {
  test("responde ok cuando la BD responde", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  test("responde 503 cuando la BD no está disponible", async () => {
    const spy = jest.spyOn(dbPool, "query").mockRejectedValue(new Error("connection refused"));
    try {
      const res = await request(app).get("/health");
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ status: "error" });
    } finally {
      spy.mockRestore();
    }
  });
});