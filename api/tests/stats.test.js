const { app, request, pool, resetDb, closeDb, registerUser, authHeader } = require("./helpers");

beforeEach(resetDb);
afterAll(closeDb);

const BOOK = {
  google_id: "stats_test",
  title: "El nombre del viento",
  author: "Patrick Rothfuss",
  pages: 300,
};

async function addBook(token, overrides = {}) {
  const res = await request(app)
    .post("/user-books")
    .set(authHeader(token))
    .send({ ...BOOK, google_id: `stats_${Date.now()}_${Math.random()}`, ...overrides });
  return res.body;
}

// Fecha YYYY-MM-DD en hora Bogotá, N días hacia atrás desde hoy.
async function bogotaDateDaysAgo(daysBack) {
  const { rows } = await pool.query(
    `SELECT TO_CHAR((NOW() AT TIME ZONE 'America/Bogota')::date - $1::int, 'YYYY-MM-DD') AS d`,
    [daysBack]
  );
  return rows[0].d;
}

// Inserta una sesión en un día concreto (hora 12:00 UTC, que cae en el mismo día Bogotá).
async function insertSessionOnDay(userId, userBookId, daysBack, durationSeconds, pagesRead = 0) {
  const date = await bogotaDateDaysAgo(daysBack);
  await pool.query(
    `INSERT INTO reading_sessions (user_book_id, user_id, page, pages_read, duration_seconds, created_at)
     VALUES ($1, $2, 100, $3, $4, $5::timestamp)`,
    [userBookId, userId, pagesRead, durationSeconds, `${date} 12:00:00`]
  );
}

describe("GET /stats", () => {
  test("cuenta por estado, total_pages (solo completados) y avg_rating", async () => {
    const { token } = await registerUser();
    const done = await addBook(token, { title: "Completado" });
    const reading = await addBook(token, { title: "Leyendo" });
    await addBook(token, { title: "Pendiente" });

    await pool.query(
      `UPDATE user_books SET status = 'completed', rating = 5 WHERE id = $1`,
      [done.id]
    );
    await pool.query(`UPDATE user_books SET status = 'reading' WHERE id = $1`, [reading.id]);

    const res = await request(app).get("/stats").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      completed: "1",
      reading: "1",
      pending: "1",
      wishlist: "0",
      paused: "0",
      abandoned: "0",
      total_pages: "300",
      avg_rating: "5.0",
    });
    expect(res.body.year).toBe(new Date().getFullYear());
  });

  test("avg_rating promedia y redondea a 1 decimal", async () => {
    const { token } = await registerUser();
    const a = await addBook(token, { title: "A" });
    const b = await addBook(token, { title: "B" });
    await pool.query(`UPDATE user_books SET status = 'completed', rating = 5 WHERE id = $1`, [a.id]);
    await pool.query(`UPDATE user_books SET status = 'completed', rating = 4 WHERE id = $1`, [b.id]);

    const res = await request(app).get("/stats").set(authHeader(token));
    expect(res.body.avg_rating).toBe("4.5");
  });

  test("pages_per_day divide páginas entre días transcurridos", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    const start = await bogotaDateDaysAgo(30);
    const end = await bogotaDateDaysAgo(0);
    await pool.query(
      `UPDATE user_books SET status = 'completed', started_at = $2, finished_at = $3 WHERE id = $1`,
      [book.id, start, end]
    );

    const res = await request(app).get("/stats").set(authHeader(token));
    expect(Number(res.body.pages_per_day)).toBeCloseTo(10, 1);
  });

  test("pages_per_day nulo si faltan started_at o finished_at", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await pool.query(`UPDATE user_books SET status = 'completed', finished_at = $2 WHERE id = $1`,
      [book.id, await bogotaDateDaysAgo(0)]);

    const res = await request(app).get("/stats").set(authHeader(token));
    expect(res.body.pages_per_day).toBe(null);
  });

  test("goal_this_year toma la meta anual del año pedido", async () => {
    const { token, user } = await registerUser();
    await pool.query(
      `INSERT INTO reading_goals (user_id, type, metric, value, year)
       VALUES ($1, 'annual', 'books', 20, $2)`,
      [user.id, new Date().getFullYear()]
    );

    const res = await request(app).get(`/stats?year=${new Date().getFullYear()}`).set(authHeader(token));
    expect(res.body.goal_this_year).toBe(20);
  });

  test("aisla los datos entre usuarios", async () => {
    const { token } = await registerUser();
    const other = await registerUser({ username: "otro", email: "otro@example.com" });
    const book = await addBook(other.token);
    await pool.query(`UPDATE user_books SET status = 'completed', rating = 5 WHERE id = $1`, [book.id]);

    const res = await request(app).get("/stats").set(authHeader(token));
    expect(res.body.completed).toBe("0");
    expect(res.body.total_pages).toBe("0");
  });

  test("sin token devuelve 401", async () => {
    const res = await request(app).get("/stats");
    expect(res.status).toBe(401);
  });
});

describe("GET /stats/streak", () => {
  test("sin sesiones devuelve current 0 y best 0", async () => {
    const { token } = await registerUser();
    const res = await request(app).get("/stats/streak").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ current: 0, best: 0, hasSessionToday: false });
  });

  test("racha continua de hoy, ayer y anteayer -> current 3, best 3", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);
    await insertSessionOnDay(user.id, book.id, 0, 1800);
    await insertSessionOnDay(user.id, book.id, 1, 1800);
    await insertSessionOnDay(user.id, book.id, 2, 1800);

    const res = await request(app).get("/stats/streak").set(authHeader(token));
    expect(res.body).toMatchObject({ current: 3, best: 3, hasSessionToday: true });
  });

  test("hueco ayer rompe la racha actual pero no el récord", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);
    await insertSessionOnDay(user.id, book.id, 0, 1800);
    await insertSessionOnDay(user.id, book.id, 2, 1800);
    await insertSessionOnDay(user.id, book.id, 3, 1800);

    const res = await request(app).get("/stats/streak").set(authHeader(token));
    expect(res.body).toMatchObject({ current: 1, best: 2, hasSessionToday: true });
  });

  test("sin sesión hoy, la racha no se rompe hasta terminar el día", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);
    await insertSessionOnDay(user.id, book.id, 1, 1800);
    await insertSessionOnDay(user.id, book.id, 2, 1800);

    const res = await request(app).get("/stats/streak").set(authHeader(token));
    expect(res.body).toMatchObject({ current: 2, best: 2, hasSessionToday: false });
  });
});

describe("GET /stats/goal", () => {
  test("sin meta devuelve 0 y completed_this_year del año actual", async () => {
    const { token } = await registerUser();
    const res = await request(app).get("/stats/goal").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.goal).toBe(0);
    expect(res.body.completed).toBe(0);
    expect(res.body.year).toBe(new Date().getFullYear());
  });

  test("completa un libro este año y actualiza la meta", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await pool.query(
      `UPDATE user_books SET status = 'completed', finished_at = $2 WHERE id = $1`,
      [book.id, await bogotaDateDaysAgo(0)]
    );

    const res = await request(app).get("/stats/goal").set(authHeader(token));
    expect(res.body.completed).toBe(1);
  });

  test("persiste la meta tras PATCH /stats/goal", async () => {
    const { token } = await registerUser();
    const patch = await request(app).patch("/stats/goal").set(authHeader(token)).send({ goal: 30 });
    expect(patch.status).toBe(200);

    const res = await request(app).get("/stats/goal").set(authHeader(token));
    expect(res.body.goal).toBe(30);
  });
});