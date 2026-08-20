const { app, request, resetDb, closeDb, registerUser, authHeader } = require("./helpers");

beforeEach(resetDb);
afterAll(closeDb);

describe("POST /goals", () => {
  test("crea una meta anual", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/goals")
      .set(authHeader(token))
      .send({ type: "annual", metric: "books", value: 20 });
    expect(res.status).toBe(201);
    expect(res.body.value).toBe(20);
  });

  test("actualiza la meta existente del mismo tipo y año", async () => {
    const { token } = await registerUser();
    await request(app).post("/goals").set(authHeader(token)).send({ type: "annual", metric: "books", value: 10 });
    const res = await request(app).post("/goals").set(authHeader(token)).send({ type: "annual", metric: "books", value: 15 });
    expect(res.status).toBe(201);
    expect(res.body.value).toBe(15);
  });

  test("rechaza tipo no permitido", async () => {
    const { token } = await registerUser();
    const res = await request(app).post("/goals").set(authHeader(token)).send({ type: "custom", metric: "books", value: 5 });
    expect(res.status).toBe(400);
  });

  test("rechaza métrica no permitida", async () => {
    const { token } = await registerUser();
    const res = await request(app).post("/goals").set(authHeader(token)).send({ type: "annual", metric: "paginas", value: 5 });
    expect(res.status).toBe(400);
  });
});

describe("GET /goals", () => {
  test("devuelve metas y progreso del usuario", async () => {
    const { token } = await registerUser();
    await request(app).post("/goals").set(authHeader(token)).send({ type: "annual", metric: "books", value: 20 });
    const res = await request(app).get("/goals").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.goals).toHaveLength(1);
    expect(res.body.goals[0].value).toBe(20);
    expect(res.body.progress.annual).toBe(0);
  });
});

describe("PATCH /stats/goal", () => {
  test("actualiza la meta de lectura anual en users", async () => {
    const { token } = await registerUser();
    const res = await request(app).patch("/stats/goal").set(authHeader(token)).send({ goal: 30 });
    expect(res.status).toBe(200);
    expect(res.body.goal).toBe(30);
  });

  test("rechaza meta no numérica", async () => {
    const { token } = await registerUser();
    const res = await request(app).patch("/stats/goal").set(authHeader(token)).send({ goal: "muchos" });
    expect(res.status).toBe(400);
  });
});

describe("GET /stats", () => {
  test("devuelve estadísticas del usuario", async () => {
    const { token } = await registerUser();
    const res = await request(app).get("/stats").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("completed");
    expect(res.body).toHaveProperty("year");
  });
});