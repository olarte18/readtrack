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

async function addSession(token, userBookId, durationSeconds, pagesRead = 1, createdArbitrary = false) {
  const res = await request(app)
    .post("/reading-sessions")
    .set(authHeader(token))
    .send({ user_book_id: userBookId, page: 10, duration_seconds: durationSeconds, pages_read: pagesRead });
  if (createdArbitrary) {
    await pool.query(
      `UPDATE reading_sessions SET created_at = NOW() AT TIME ZONE 'America/Bogota' - INTERVAL '1 month' WHERE id = $1`,
      [res.body.id]
    );
  }
  return res.body;
}

describe("GET /goals/detail", () => {
  test("rechaza tipo o métrica inválidos", async () => {
    const { token } = await registerUser();
    const res1 = await request(app).get("/goals/detail").set(authHeader(token)).query({ type: "custom", metric: "books" });
    expect(res1.status).toBe(400);
    const res2 = await request(app).get("/goals/detail").set(authHeader(token)).query({ type: "monthly", metric: "paginas" });
    expect(res2.status).toBe(400);
    const res3 = await request(app).get("/goals/detail").set(authHeader(token)).query({ type: "monthly" });
    expect(res3.status).toBe(400);
  });

  test("monthly books devuelve solo libros completados este mes", async () => {
    const { token } = await registerUser();
    const prev = await addBook(token, { title: "Mes anterior" });
    const current = await addBook(token, { title: "Mes actual" });
    const { rows: prevDate } = await pool.query(
      `SELECT TO_CHAR((NOW() AT TIME ZONE 'America/Bogota')::date - INTERVAL '1 month', 'YYYY-MM-DD') AS d`
    );
    const { rows: nowDate } = await pool.query(
      `SELECT TO_CHAR(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS d`
    );
    await completeBook(token, prev.id, prevDate[0].d);
    await completeBook(token, current.id, nowDate[0].d);

    const res = await request(app).get("/goals/detail").set(authHeader(token)).query({ type: "monthly", metric: "books" });
    expect(res.status).toBe(200);
    expect(res.body.progress).toBe(1);
    expect(res.body.books).toHaveLength(1);
    expect(res.body.books[0].title).toBe("Mes actual");
    expect(res.body.books[0].id).toBe(current.id);
  });

  test("annual books cuenta todos los libros del año Bogotá", async () => {
    const { token } = await registerUser();
    const book1 = await addBook(token, { title: "Libro 1" });
    const book2 = await addBook(token, { title: "Libro 2" });
    const { rows: nowDate } = await pool.query(
      `SELECT TO_CHAR(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS d`
    );
    const { rows: otherMonth } = await pool.query(
      `SELECT TO_CHAR(
         date_trunc('year', NOW() AT TIME ZONE 'America/Bogota')::date + INTERVAL '1 month',
         'YYYY-MM-DD') AS d`
    );
    await completeBook(token, book1.id, nowDate[0].d);
    await completeBook(token, book2.id, otherMonth[0].d);

    const res = await request(app).get("/goals/detail").set(authHeader(token)).query({ type: "annual", metric: "books" });
    expect(res.body.progress).toBe(2);
    expect(res.body.books).toHaveLength(2);
  });

  test("monthly hours agrega minutos por libro y excluye sesiones antiguas", async () => {
    const { token } = await registerUser();
    const book1 = await addBook(token, { title: "Activo" });
    const book2 = await addBook(token, { title: "Antiguo" });
    await addSession(token, book1.id, 7200, 20);
    await addSession(token, book1.id, 1800, 5);
    await addSession(token, book2.id, 900, 2, true);

    const res = await request(app).get("/goals/detail").set(authHeader(token)).query({ type: "monthly", metric: "hours" });
    expect(res.status).toBe(200);
    expect(res.body.books).toHaveLength(1);
    expect(res.body.books[0].title).toBe("Activo");
    expect(res.body.books[0].minutes).toBe(150);
    expect(res.body.progress).toBe(150);
  });

  test("weekly hours solo cuenta la semana actual", async () => {
    const { token } = await registerUser();
    const book1 = await addBook(token, { title: "Semana actual" });
    const book2 = await addBook(token, { title: "Fuera de semana" });
    await addSession(token, book1.id, 3600, 10);
    await addSession(token, book2.id, 3600, 10, true);

    const res = await request(app).get("/goals/detail").set(authHeader(token)).query({ type: "weekly", metric: "hours" });
    expect(res.body.books).toHaveLength(1);
    expect(res.body.books[0].title).toBe("Semana actual");
    expect(res.body.books[0].minutes).toBe(60);
  });
});