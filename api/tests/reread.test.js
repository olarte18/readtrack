const { app, request, pool, resetDb, closeDb, registerUser, authHeader } = require("./helpers");
const { appDay } = require("../src/utils/dates");

beforeEach(resetDb);
afterAll(closeDb);

const BOOK = {
  google_id: "abc123",
  title: "El nombre del viento",
  author: "Patrick Rothfuss",
  pages: 700,
};

async function addBook(token, overrides = {}) {
  return request(app).post("/user-books").set(authHeader(token)).send({ ...BOOK, ...overrides });
}

async function completeRead(token, id, overrides = {}) {
  return request(app)
    .patch(`/user-books/${id}`)
    .set(authHeader(token))
    .send({ status: "completed", current_page: 700, finished_at: "2026-09-01", ...overrides });
}

describe("read_number en POST /user-books", () => {
  test("la primera copia es lectura 1 y la segunda lectura 2", async () => {
    const { token } = await registerUser();
    const first = await addBook(token);
    expect(first.status).toBe(201);
    expect(first.body.read_number).toBe(1);

    const second = await addBook(token);
    expect(second.status).toBe(201);
    expect(second.body.read_number).toBe(2);
  });

  test("libros distintos empiezan cada uno en lectura 1", async () => {
    const { token } = await registerUser();
    const a = await addBook(token);
    const b = await addBook(token, { google_id: "otro-google" });
    expect(a.body.read_number).toBe(1);
    expect(b.body.read_number).toBe(1);
  });
});

describe("GET /user-books con relecturas", () => {
  test("expone read_number y oculta las lecturas archivadas", async () => {
    const { token } = await registerUser();
    const first = await addBook(token);
    await completeRead(token, first.body.id);

    const reread = await request(app)
      .post(`/user-books/${first.body.id}/reread`)
      .set(authHeader(token))
      .send({});
    expect(reread.status).toBe(201);

    const list = await request(app).get("/user-books").set(authHeader(token));
    expect(list.body).toHaveLength(1);
    expect(list.body[0].read_number).toBe(2);
    expect(list.body[0].title).toBe(BOOK.title);
    expect(reread.body.status).toBe("reading");
    expect(reread.body.current_page).toBe(0);
  });
});

describe("GET /user-books/check con relecturas", () => {
  test("ignora las lecturas archivadas", async () => {
    const { token } = await registerUser();
    const first = await addBook(token);
    await completeRead(token, first.body.id);
    await request(app).post(`/user-books/${first.body.id}/reread`).set(authHeader(token)).send({});

    const res = await request(app).get("/user-books/check/abc123").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(true);
    expect(res.body.status).toBe("reading");
    expect(res.body.id).not.toBe(first.body.id);
  });
});

describe("POST /user-books/:id/reread", () => {
  test("archiva la lectura anterior y abre la siguiente", async () => {
    const { token } = await registerUser();
    const first = await addBook(token);
    await completeRead(token, first.body.id);

    const res = await request(app)
      .post(`/user-books/${first.body.id}/reread`)
      .set(authHeader(token))
      .send({ started_at: "2026-09-01" });
    expect(res.status).toBe(201);
    expect(res.body.read_number).toBe(2);
    expect(res.body.status).toBe("reading");
    expect(res.body.current_page).toBe(0);
    expect(res.body.started_at).toMatch(/^2026-09-01/);
    expect(res.body.reading_mode).toBe("page");

    const history = await request(app).get(`/user-books/${res.body.id}/history`).set(authHeader(token));
    expect(history.body).toHaveLength(1);
    expect(history.body[0].read_number).toBe(1);
    expect(history.body[0].finished_at).not.toBeNull();
  });

  test("sin started_at usa la fecha de hoy", async () => {
    const { token } = await registerUser();
    const first = await addBook(token);
    await completeRead(token, first.body.id);

    const res = await request(app).post(`/user-books/${first.body.id}/reread`).set(authHeader(token)).send({});
    expect(res.body.started_at).toMatch(new RegExp("^" + appDay()));
  });

  test("rechaza started_at mal formateado", async () => {
    const { token } = await registerUser();
    const first = await addBook(token);
    await completeRead(token, first.body.id);

    const res = await request(app)
      .post(`/user-books/${first.body.id}/reread`)
      .set(authHeader(token))
      .send({ started_at: "01/09/2026" });
    expect(res.status).toBe(400);
  });

  test("solo permite releer un libro completado", async () => {
    const { token } = await registerUser();
    const first = await addBook(token);

    const res = await request(app).post(`/user-books/${first.body.id}/reread`).set(authHeader(token)).send({});
    expect(res.status).toBe(400);
  });

  test("aislamiento: el usuario B no puede releer el libro de A", async () => {
    const a = await registerUser();
    const first = await addBook(a.token);
    await completeRead(a.token, first.body.id);

    const b = await registerUser({ username: "b", email: "b@example.com" });
    const res = await request(app).post(`/user-books/${first.body.id}/reread`).set(authHeader(b.token)).send({});
    expect(res.status).toBe(404);
  });

  test("mantiene la dieta de sesiones de la lectura anterior intacta", async () => {
    const { token, user } = await registerUser();
    const first = await addBook(token);
    await completeRead(token, first.body.id);
    await pool.query(
      `INSERT INTO reading_sessions (user_book_id, user_id, page, duration_seconds, pages_read)
       VALUES ($1, $2, 700, 3600, 700)`,
      [first.body.id, user.id]
    );

    const res = await request(app).post(`/user-books/${first.body.id}/reread`).set(authHeader(token)).send({});
    expect(res.status).toBe(201);

    const sessions = await pool.query("SELECT * FROM reading_sessions WHERE user_book_id = $1", [first.body.id]);
    expect(sessions.rowCount).toBe(1);

    const history = await request(app).get(`/user-books/${res.body.id}/history`).set(authHeader(token));
    expect(history.body[0].sessions).toBe(1);
    expect(history.body[0].duration_seconds).toBe(3600);
    expect(history.body[0].pages_read).toBe(700);
  });
});

describe("GET /user-books/:id/history", () => {
  test("devuelve [] cuando no hay lecturas anteriores", async () => {
    const { token } = await registerUser();
    const first = await addBook(token);
    const res = await request(app).get(`/user-books/${first.body.id}/history`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("ordena de la lectura más reciente a la más antigua", async () => {
    const { token } = await registerUser();
    const first = await addBook(token);
    await completeRead(token, first.body.id);
    const second = await request(app).post(`/user-books/${first.body.id}/reread`).set(authHeader(token)).send({});
    await completeRead(token, second.body.id);
    const third = await request(app).post(`/user-books/${second.body.id}/reread`).set(authHeader(token)).send({});

    const history = await request(app).get(`/user-books/${third.body.id}/history`).set(authHeader(token));
    expect(history.body.map((h) => h.read_number)).toEqual([2, 1]);
  });
});

describe("contadores con relecturas", () => {
  test("las lecturas archivadas no cuentan como completadas", async () => {
    const { token } = await registerUser();
    const first = await addBook(token);
    await completeRead(token, first.body.id);

    const before = await request(app).get("/stats").set(authHeader(token));
    expect(parseInt(before.body.completed)).toBe(1);

    await request(app).post(`/user-books/${first.body.id}/reread`).set(authHeader(token)).send({});

    const res = await request(app).get("/stats").set(authHeader(token));
    expect(parseInt(res.body.completed)).toBe(0);
    expect(parseInt(res.body.reading)).toBe(1);
  });

  test("stats/goal no cuenta las lecturas archivadas", async () => {
    const { token } = await registerUser();
    const first = await addBook(token);
    await completeRead(token, first.body.id);
    await request(app).patch("/stats/goal").set(authHeader(token)).send({ goal: 3 });

    await request(app).post(`/user-books/${first.body.id}/reread`).set(authHeader(token)).send({});

    const res = await request(app).get("/stats/goal").set(authHeader(token));
    expect(res.body.completed).toBe(0);
  });
});