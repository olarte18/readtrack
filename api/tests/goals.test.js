const { app, request, pool, resetDb, closeDb, registerUser, authHeader } = require("./helpers");

beforeEach(resetDb);
afterAll(closeDb);

async function addBook(token, overrides = {}) {
  const res = await request(app)
    .post("/user-books")
    .set(authHeader(token))
    .send({ google_id: `test_${Date.now()}_${Math.random()}`, title: "Libro", pages: 300, ...overrides });
  return res.body;
}

async function completeBook(token, userBookId, finishedAt) {
  await pool.query(`UPDATE user_books SET status = 'completed', finished_at = $1 WHERE id = $2`, [finishedAt, userBookId]);
}

async function bogotaDate() {
  const { rows } = await pool.query(`SELECT TO_CHAR(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS d`);
  return rows[0].d;
}

async function prevMonthDate() {
  const { rows } = await pool.query(
    `SELECT TO_CHAR((NOW() AT TIME ZONE 'America/Bogota')::date - INTERVAL '1 month', 'YYYY-MM-DD') AS d`
  );
  return rows[0].d;
}

async function thisYearOtherMonthDate() {
  const { rows } = await pool.query(
    `SELECT TO_CHAR(
       date_trunc('year', NOW() AT TIME ZONE 'America/Bogota')::date + INTERVAL '1 month',
       'YYYY-MM-DD') AS d`
  );
  return rows[0].d;
}

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

describe("GET /goals — monthly_books con zona Bogotá", () => {
  test("cuenta libros completados en el mes actual Bogotá", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await completeBook(token, book.id, await bogotaDate());

    await request(app).post("/goals").set(authHeader(token)).send({ type: "monthly", metric: "books", value: 3 });
    const res = await request(app).get("/goals").set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.progress.monthly_books).toBe(1);
  });

  test("excluye libros del mes anterior", async () => {
    const { token } = await registerUser();
    const book1 = await addBook(token, { title: "Mes anterior" });
    const book2 = await addBook(token, { title: "Mes actual" });
    await completeBook(token, book1.id, await prevMonthDate());
    await completeBook(token, book2.id, await bogotaDate());

    await request(app).post("/goals").set(authHeader(token)).send({ type: "monthly", metric: "books", value: 3 });
    const res = await request(app).get("/goals").set(authHeader(token));

    expect(res.body.progress.monthly_books).toBe(1);
  });

  test("annual cuenta todos los libros del año Bogotá", async () => {
    const { token } = await registerUser();
    const book1 = await addBook(token, { title: "Libro 1" });
    const book2 = await addBook(token, { title: "Libro 2" });
    await completeBook(token, book1.id, await bogotaDate());
    await completeBook(token, book2.id, await thisYearOtherMonthDate());

    const res = await request(app).get("/goals").set(authHeader(token));

    expect(res.body.progress.annual).toBe(2);
  });
});