const { app, request, pool, resetDb, closeDb, registerUser, authHeader } = require("./helpers");

beforeEach(resetDb);
afterAll(closeDb);

const BOOK = {
  google_id: "calendar_test",
  title: "El nombre del viento",
  author: "Patrick Rothfuss",
  pages: 700,
};

async function addBook(token, overrides = {}) {
  const res = await request(app)
    .post("/user-books")
    .set(authHeader(token))
    .send({ ...BOOK, google_id: `cal_${Date.now()}_${Math.random()}`, ...overrides });
  return res.body;
}

// Inserta una sesión con created_at UTC controlado (12:00 UTC cae en el mismo día Bogotá).
async function insertSession(userId, userBookId, isoUtc, durationSeconds, pagesRead = 10) {
  await pool.query(
    `INSERT INTO reading_sessions (user_book_id, user_id, page, pages_read, duration_seconds, created_at)
     VALUES ($1, $2, 100, $3, $4, $5::timestamp)`,
    [userBookId, userId, pagesRead, durationSeconds, isoUtc]
  );
}

async function bogotaToday() {
  const { rows } = await pool.query(`SELECT TO_CHAR(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS d`);
  return rows[0].d;
}

async function bogotaDaysAgo(daysBack) {
  const { rows } = await pool.query(
    `SELECT TO_CHAR((NOW() AT TIME ZONE 'America/Bogota')::date - $1::int, 'YYYY-MM-DD') AS d`,
    [daysBack]
  );
  return rows[0].d;
}

describe("GET /calendar/:year/:month", () => {
  test("marca counts=false los días que no califican para la racha", async () => {
    const { token, user } = await registerUser();
    const libro = await addBook(token, { reading_mode: "page" });

    // 2 min y 0 páginas: hay sesión pero el día no suma a la racha.
    await insertSession(user.id, libro.id, "2025-03-01 12:00:00", 120, 0);

    const res = await request(app).get("/calendar/2025/3").set(authHeader(token));
    expect(res.status).toBe(200);
    const dia = res.body.days.find((d) => d.date === "2025-03-01");
    expect(dia).toMatchObject({ minutes: 2, pages: 0, counts: false });
  });

  test("marca counts=true los días que sí califican", async () => {
    const { token, user } = await registerUser();
    const libro = await addBook(token, { reading_mode: "page" });

    await insertSession(user.id, libro.id, "2025-03-01 12:00:00", 600, 4);

    const res = await request(app).get("/calendar/2025/3").set(authHeader(token));
    const dia = res.body.days.find((d) => d.date === "2025-03-01");
    expect(dia).toMatchObject({ minutes: 10, pages: 4, counts: true });
  });

  test("todayCounts refleja si hoy califica (no solo si hubo sesión)", async () => {
    const { token, user } = await registerUser();
    const libro = await addBook(token, { reading_mode: "page" });

    await insertSession(user.id, libro.id, new Date().toISOString(), 120, 0);

    const today = await bogotaToday();
    const res = await request(app)
      .get(`/calendar/${today.slice(0, 4)}/${Number(today.slice(5, 7))}`)
      .set(authHeader(token));
    expect(res.body.hasSessionToday).toBe(true);
    expect(res.body.todayCounts).toBe(false);
  });
  test("agrega minutos y páginas por día y detalla por libro", async () => {
    const { token, user } = await registerUser();
    const libro1 = await addBook(token, { title: "Libro 1", author: "Autor 1" });
    const libro2 = await addBook(token, { title: "Libro 2", author: "Autor 2" });

    await insertSession(user.id, libro1.id, "2025-03-01 12:00:00", 1800, 5);
    await insertSession(user.id, libro1.id, "2025-03-01 13:00:00", 600, 2);
    await insertSession(user.id, libro2.id, "2025-03-02 12:00:00", 1200, 10);

    const res = await request(app).get("/calendar/2025/3").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.year).toBe(2025);
    expect(res.body.month).toBe(3);

    expect(res.body.days).toHaveLength(2);
    const dia1 = res.body.days.find((d) => d.date === "2025-03-01");
    const dia2 = res.body.days.find((d) => d.date === "2025-03-02");
    expect(dia1).toMatchObject({ minutes: 40, pages: 7 });
    expect(dia2).toMatchObject({ minutes: 20, pages: 10 });

    expect(dia1.books).toHaveLength(1);
    expect(dia1.books[0]).toMatchObject({ title: "Libro 1", author: "Autor 1", minutes: 40, pages: 7 });
    expect(dia2.books[0]).toMatchObject({ title: "Libro 2", author: "Autor 2", minutes: 20, pages: 10 });
  });

  test("dos libros el mismo día aparecen como libros separados", async () => {
    const { token, user } = await registerUser();
    const libro1 = await addBook(token, { title: "Libro A" });
    const libro2 = await addBook(token, { title: "Libro B" });
    await insertSession(user.id, libro1.id, "2025-03-05 12:00:00", 900, 3);
    await insertSession(user.id, libro2.id, "2025-03-05 13:00:00", 300, 1);

    const res = await request(app).get("/calendar/2025/3").set(authHeader(token));
    const day = res.body.days.find((d) => d.date === "2025-03-05");
    expect(day.books).toHaveLength(2);
    expect(day).toMatchObject({ minutes: 20, pages: 4 });
  });

  test("mes vacío devuelve days vacío", async () => {
    const { token } = await registerUser();
    const res = await request(app).get("/calendar/2025/6").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.days).toEqual([]);
  });

  test("expone daily_goal_minutes del año actual", async () => {
    const { token, user } = await registerUser();
    await pool.query(
      "INSERT INTO reading_goals (user_id, type, metric, value, year) VALUES ($1,'daily','minutes',30,$2)",
      [user.id, new Date().getFullYear()]
    );

    const res = await request(app).get(`/calendar/${new Date().getFullYear()}/3`).set(authHeader(token));
    expect(res.body.daily_goal_minutes).toBe(30);
  });

  test("streak cuenta todas las sesiones, no solo las del mes", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);
    const today = await bogotaToday();
    const yesterday = await bogotaDaysAgo(1);

    await insertSession(user.id, book.id, `${today} 12:00:00`, 600); // sesión "de hoy"
    await insertSession(user.id, book.id, `${yesterday} 12:00:00`, 600); // día anterior

    // Consultar un mes que NO contiene esas sesiones (invierno boreal de 2020)
    const res = await request(app).get("/calendar/2020/1").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.days).toEqual([]);
    expect(res.body.streak.current).toBeGreaterThanOrEqual(1);
  });

  test("hasSessionToday refleja si hubo sesión hoy, en cualquier mes consultado", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);

    // Sin sesión hoy
    const empty = await request(app).get("/calendar/2020/1").set(authHeader(token));
    expect(empty.body.hasSessionToday).toBe(false);

    // Una sesión "de hoy" (hora Bogotá) debe encender la racha en cualquier mes
    await insertSession(user.id, book.id, `${await bogotaToday()} 12:00:00`, 600);
    const res = await request(app).get("/calendar/2020/1").set(authHeader(token));
    expect(res.body.days).toEqual([]);
    expect(res.body.hasSessionToday).toBe(true);
  });

  test("aisla los datos entre usuarios", async () => {
    const { token } = await registerUser();
    const other = await registerUser({ username: "otro", email: "otro@example.com" });
    const book = await addBook(other.token);
    await insertSession(other.user.id, book.id, "2025-03-01 12:00:00", 1800);

    const res = await request(app).get("/calendar/2025/3").set(authHeader(token));
    expect(res.body.days).toEqual([]);
  });

  test("sin token devuelve 401", async () => {
    const res = await request(app).get("/calendar/2025/3");
    expect(res.status).toBe(401);
  });

  test("valida mes y año inválidos", async () => {
    const { token } = await registerUser();
    expect((await request(app).get("/calendar/2025/0").set(authHeader(token))).status).toBe(400);
    expect((await request(app).get("/calendar/2025/13").set(authHeader(token))).status).toBe(400);
    expect((await request(app).get("/calendar/2025/2.5").set(authHeader(token))).status).toBe(400);
    expect((await request(app).get("/calendar/1800/5").set(authHeader(token))).status).toBe(400);
    expect((await request(app).get("/calendar/abc/3").set(authHeader(token))).status).toBe(400);
    expect((await request(app).get("/calendar/2025/xyz").set(authHeader(token))).status).toBe(400);
  });
});