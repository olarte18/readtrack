const { app, request, pool, resetDb, closeDb, registerUser, authHeader } = require("./helpers");

beforeEach(resetDb);
afterAll(closeDb);

const BOOK = {
  google_id: "abc123",
  title: "El nombre del viento",
  author: "Patrick Rothfuss",
  pages: 700,
};

async function addBook(token) {
  const res = await request(app).post("/user-books").set(authHeader(token)).send(BOOK);
  return res.body;
}

async function addSession(token, userBookId, body) {
  const res = await request(app)
    .post("/reading-sessions")
    .set(authHeader(token))
    .send({ user_book_id: userBookId, page: 100, duration_seconds: 1800, pages_read: 0, ...body });
  return res.body;
}

describe("PATCH /reading-sessions/:id", () => {
  test("edita la página y páginas leídas de una sesión", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    const session = await addSession(token, book.id, { page: 100, pages_read: 0 });

    const res = await request(app)
      .patch(`/reading-sessions/${session.id}`)
      .set(authHeader(token))
      .send({ page: 145, pages_read: 45 });
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(145);
    expect(res.body.pages_read).toBe(45);
    expect(res.body.duration_seconds).toBe(1800);
  });

  test("sincroniza current_page del libro si es la última sesión", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await request(app).patch(`/user-books/${book.id}`).set(authHeader(token)).send({ status: "reading" });
    const session = await addSession(token, book.id, { page: 100, pages_read: 0 });

    await request(app)
      .patch(`/reading-sessions/${session.id}`)
      .set(authHeader(token))
      .send({ page: 250, pages_read: 150 });

    const lib = await request(app).get("/user-books").set(authHeader(token));
    expect(lib.body[0].current_page).toBe(250);
  });

  test("no sincroniza current_page si la sesión editada no es la última", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await request(app).patch(`/user-books/${book.id}`).set(authHeader(token)).send({ status: "reading" });
    const first = await addSession(token, book.id, { page: 100 });
    await addSession(token, book.id, { page: 200 });
    await request(app).patch(`/user-books/${book.id}`).set(authHeader(token)).send({ current_page: 200 });

    await request(app)
      .patch(`/reading-sessions/${first.id}`)
      .set(authHeader(token))
      .send({ page: 150 });

    const lib = await request(app).get("/user-books").set(authHeader(token));
    expect(lib.body[0].current_page).toBe(200);
  });

  test("rechaza campos numéricos inválidos", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    const session = await addSession(token, book.id, {});

    const res = await request(app)
      .patch(`/reading-sessions/${session.id}`)
      .set(authHeader(token))
      .send({ page: -5 });
    expect(res.status).toBe(400);
  });

  test("rechaza si no hay campos para actualizar", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    const session = await addSession(token, book.id, {});

    const res = await request(app)
      .patch(`/reading-sessions/${session.id}`)
      .set(authHeader(token))
      .send({});
    expect(res.status).toBe(400);
  });

  test("devuelve 404 para sesión de otro usuario", async () => {
    const { token } = await registerUser();
    const owner = await registerUser({ username: "dueño", email: "dueno@example.com" });
    const book = await addBook(owner.token);
    const session = await addSession(owner.token, book.id, {});

    const res = await request(app)
      .patch(`/reading-sessions/${session.id}`)
      .set(authHeader(token))
      .send({ page: 300 });
    expect(res.status).toBe(404);
  });
});

describe("GET /reading-sessions/:user_book_id", () => {
  test("lista sesiones con id, páginas y duración", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await addSession(token, book.id, { page: 120, duration_seconds: 900, pages_read: 20 });

    const res = await request(app).get(`/reading-sessions/${book.id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0]).toMatchObject({
      page: 120,
      pages_read: 20,
      duration_seconds: 900,
    });
    expect(typeof res.body[0].id).toBe("number");
    expect(res.body[0].time_bogota).toMatch(/^\d{2}:\d{2}$/);
    expect(res.body[0].date_bogota).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("filtra por fecha (hora Bogotá)", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await addSession(token, book.id, {});
    // Inserta manualmente una sesión de hace 10 días
    await pool.query(
      `INSERT INTO reading_sessions (user_book_id, user_id, page, duration_seconds, pages_read, created_at)
       VALUES ($1, (SELECT id FROM users WHERE email = 'test@example.com'), 50, 600, 0, NOW() - INTERVAL '10 days')`,
      [book.id]
    );

    const { rows: dates } = await pool.query(
      `SELECT DISTINCT TO_CHAR(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS d,
              MAX(page) AS page
       FROM reading_sessions WHERE user_book_id = $1 GROUP BY d ORDER BY d DESC`,
      [book.id]
    );
    expect(dates).toHaveLength(2);

    const resToday = await request(app)
      .get(`/reading-sessions/${book.id}?date=${dates[0].d}`)
      .set(authHeader(token));
    expect(resToday.body).toHaveLength(1);
    expect(resToday.body[0].page).toBe(100);

    const resOld = await request(app)
      .get(`/reading-sessions/${book.id}?date=${dates[1].d}`)
      .set(authHeader(token));
    expect(resOld.body).toHaveLength(1);
    expect(resOld.body[0].page).toBe(50);
  });

  test("rechaza fecha con formato inválido", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    const res = await request(app)
      .get(`/reading-sessions/${book.id}?date=ayer`)
      .set(authHeader(token));
    expect(res.status).toBe(400);
  });
});

describe("POST /reading-sessions — cumplimiento de metas", () => {
  test("devuelve goalJustCompleted cuando se alcanza una meta diaria", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);

    await request(app)
      .post("/goals")
      .set(authHeader(token))
      .send({ type: "daily", metric: "minutes", value: 5 });

    const res = await request(app)
      .post("/reading-sessions")
      .set(authHeader(token))
      .send({ user_book_id: book.id, page: 10, duration_seconds: 360, pages_read: 10 });

    expect(res.status).toBe(201);
    const daily = (res.body.goalJustCompleted ?? []).find((g) => g.type === "daily");
    expect(daily).toBeDefined();
    expect(daily.metric).toBe("minutes");
    expect(daily.value).toBe(5);
  });

  test("no devuelve metas si no se alcanzó ninguna", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);

    await request(app)
      .post("/goals")
      .set(authHeader(token))
      .send({ type: "weekly", metric: "hours", value: 20 });

    const res = await request(app)
      .post("/reading-sessions")
      .set(authHeader(token))
      .send({ user_book_id: book.id, page: 10, duration_seconds: 600, pages_read: 10 });

    expect(res.status).toBe(201);
    expect(res.body.goalJustCompleted).toEqual([]);
  });

  test("devuelve meta anual de libros al completar un libro", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);

    await request(app)
      .post("/goals")
      .set(authHeader(token))
      .send({ type: "annual", metric: "books", value: 1 });

    // Marca el libro como completo para cumplir la meta anual
    await request(app)
      .patch(`/user-books/${book.id}`)
      .set(authHeader(token))
      .send({ status: "completed", finished_at: new Date().toISOString().slice(0, 10) });

    const res = await request(app)
      .post("/reading-sessions")
      .set(authHeader(token))
      .send({ user_book_id: book.id, page: 10, duration_seconds: 60, pages_read: 10, book_completed: true });

    expect(res.status).toBe(201);
    const annual = (res.body.goalJustCompleted ?? []).find((g) => g.type === "annual");
    expect(annual).toBeDefined();
    expect(annual.metric).toBe("books");
    expect(annual.value).toBe(1);
  });

  test("no repite una meta diaria ya cumplida en sesiones posteriores", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);

    await request(app)
      .post("/goals")
      .set(authHeader(token))
      .send({ type: "daily", metric: "minutes", value: 5 });

    const first = await request(app)
      .post("/reading-sessions")
      .set(authHeader(token))
      .send({ user_book_id: book.id, page: 10, duration_seconds: 360, pages_read: 10 });
    expect(first.status).toBe(201);
    const firstDaily = (first.body.goalJustCompleted ?? []).find((g) => g.type === "daily");
    expect(firstDaily).toBeDefined();

    const second = await request(app)
      .post("/reading-sessions")
      .set(authHeader(token))
      .send({ user_book_id: book.id, page: 20, duration_seconds: 600, pages_read: 10 });
    expect(second.status).toBe(201);
    const secondDaily = (second.body.goalJustCompleted ?? []).find((g) => g.type === "daily");
    expect(secondDaily).toBeUndefined();
  });
});

describe("start_page column", () => {
  test("POST guarda start_page y GET lo devuelve", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);

    const res = await request(app)
      .post("/reading-sessions")
      .set(authHeader(token))
      .send({ user_book_id: book.id, page: 50, start_page: 40, duration_seconds: 1800, pages_read: 10 });

    expect(res.status).toBe(201);
    expect(res.body.start_page).toBe(40);
    expect(res.body.page).toBe(50);
    expect(res.body.pages_read).toBe(10);

    const getRes = await request(app)
      .get(`/reading-sessions/${book.id}`)
      .set(authHeader(token));
    expect(getRes.status).toBe(200);
    expect(getRes.body[0].start_page).toBe(40);
  });

  test("PATCH permite actualizar start_page", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    const session = await request(app)
      .post("/reading-sessions")
      .set(authHeader(token))
      .send({ user_book_id: book.id, page: 50, duration_seconds: 1800, pages_read: 10 });

    const patchRes = await request(app)
      .patch(`/reading-sessions/${session.body.id}`)
      .set(authHeader(token))
      .send({ start_page: 35 });
    expect(patchRes.status).toBe(200);
    expect(patchRes.body.start_page).toBe(35);
  });
});
