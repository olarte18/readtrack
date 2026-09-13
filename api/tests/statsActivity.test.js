const { app, request, pool, resetDb, closeDb, registerUser, authHeader } = require("./helpers");

beforeEach(resetDb);
afterAll(closeDb);

const BOOK = {
  google_id: "stats_activity",
  title: "Actividad",
  author: "Autor",
  pages: 300,
};

async function addBook(token) {
  const res = await request(app).post("/user-books").set(authHeader(token)).send(BOOK);
  return res.body;
}

// inserta una sesión con created_at (UTC) controlado, fuera del flujo de "ahora"
async function insertSession(userId, userBookId, isoUtc, durationSeconds, pagesRead = 0) {
  await pool.query(
    `INSERT INTO reading_sessions (user_book_id, user_id, page, pages_read, duration_seconds, created_at)
     VALUES ($1, $2, 100, $3, $4, $5::timestamp)`,
    [userBookId, userId, pagesRead, durationSeconds, isoUtc]
  );
}

const isoWeekStart = (iso) => {
  const d = new Date(`${iso}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7;
  const monday = new Date(d.getTime() - dow * 86400000);
  return monday.toISOString().slice(0, 10);
};

describe("GET /stats/activity", () => {
  test("view=year agrupa por meses y llena los vacíos en 0", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);
    await insertSession(user.id, book.id, "2025-01-10 12:00:00", 1800, 5);
    await insertSession(user.id, book.id, "2025-03-15 12:00:00", 3600, 10);
    await insertSession(user.id, book.id, "2025-03-28 12:00:00", 600, 2);

    const res = await request(app).get("/stats/activity?view=year&year=2025").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.buckets).toHaveLength(12);
    expect(res.body.buckets[0]).toMatchObject({ label: "Ene", minutes: 30, pages: 5, sessions: 1 });
    expect(res.body.buckets[2]).toMatchObject({ minutes: 70, sessions: 2, active_days: 2 });
    expect(res.body.buckets[11]).toMatchObject({ label: "Dic", minutes: 0, sessions: 0 });
    expect(res.body.totals).toEqual({ minutes: 100, pages: 17, sessions: 3, active_days: 3 });
  });

  test("año sin datos devuelve todo en 0", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);
    await insertSession(user.id, book.id, "2025-07-04 12:00:00", 1200);

    const res = await request(app).get("/stats/activity?view=year&year=2024").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.totals.minutes).toBe(0);
    expect(res.body.totals.sessions).toBe(0);
  });

  test("view=month agrupa por día del mes", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);
    await insertSession(user.id, book.id, "2025-03-02 12:00:00", 2700, 8);
    await insertSession(user.id, book.id, "2025-03-09 12:00:00", 900, 3);

    const res = await request(app).get("/stats/activity?view=month&year=2025&month=3").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.buckets).toHaveLength(31);
    expect(res.body.buckets[0]).toMatchObject({ label: "1", minutes: 0 });
    expect(res.body.buckets[1]).toMatchObject({ label: "2", minutes: 45, pages: 8, sessions: 1 });
    expect(res.body.buckets[8]).toMatchObject({ label: "9", minutes: 15 });
    expect(res.body.totals).toEqual({ minutes: 60, pages: 11, sessions: 2, active_days: 2 });
  });

  test("view=week devuelve los 7 días de la semana (lunes = inicio)", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);
    const anchor = "2025-03-12"; // miércoles
    const monday = isoWeekStart(anchor);
    const friday = new Date(`${monday}T12:00:00Z`);
    friday.setUTCDate(friday.getUTCDate() + 4);
    const fridayIso = friday.toISOString().slice(0, 10);

    await insertSession(user.id, book.id, `${monday} 12:00:00`, 1200, 2);
    await insertSession(user.id, book.id, `${fridayIso} 12:00:00`, 600, 1);

    const res = await request(app).get(`/stats/activity?view=week&date=${anchor}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.week_start).toBe(monday);
    expect(res.body.buckets).toHaveLength(7);
    expect(res.body.buckets[0]).toMatchObject({ label: "L", minutes: 20, sessions: 1 });
    expect(res.body.buckets[4]).toMatchObject({ label: "V", minutes: 10 });
    expect(res.body.totals).toMatchObject({ minutes: 30, sessions: 2, active_days: 2 });
  });

  test("mecha la meta diaria en month/week y mensual en year", async () => {
    const { token, user } = await registerUser();
    await pool.query(
      "INSERT INTO reading_goals (user_id, type, metric, value, year) VALUES ($1,'daily','minutes',30,2025), ($1,'monthly','hours',1,2025)",
      [user.id]
    );
    const book = await addBook(token);
    await insertSession(user.id, book.id, "2025-03-02 12:00:00", 2400);

    const month = await request(app).get("/stats/activity?view=month&year=2025&month=3").set(authHeader(token));
    expect(month.body.daily_goal_minutes).toBe(30);

    const year = await request(app).get("/stats/activity?view=year&year=2025").set(authHeader(token));
    expect(year.body.monthly_goal_minutes).toBe(60); // 1 hora = 60 min
    expect(year.body.monthly_goal_metric).toBe("hours");
    expect(year.body.monthly_goal_books).toBe(null);
  });

  test("view=year expone libros por mes", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);
    await insertSession(user.id, book.id, "2025-01-10 12:00:00", 1800);
    await pool.query(
      `UPDATE user_books SET status = 'completed', finished_at = '2025-03-15',
         started_at = '2025-03-01' WHERE id = $1`,
      [book.id]
    );

    const res = await request(app).get("/stats/activity?view=year&year=2025").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.buckets[0].books).toBe(0);
    expect(res.body.buckets[2]).toMatchObject({ label: "Mar", books: 1 });
  });

  test("view=year con meta mensual en libros expone monthly_goal_books", async () => {
    const { token, user } = await registerUser();
    await pool.query(
      "INSERT INTO reading_goals (user_id, type, metric, value, year) VALUES ($1,'monthly','books',3,2025)",
      [user.id]
    );

    const res = await request(app).get("/stats/activity?view=year&year=2025").set(authHeader(token));
    expect(res.body.monthly_goal_metric).toBe("books");
    expect(res.body.monthly_goal_books).toBe(3);
    expect(res.body.monthly_goal_minutes).toBe(null);
  });

  test("valida parámetros", async () => {
    const { token } = await registerUser();
    expect((await request(app).get("/stats/activity?view=year").set(authHeader(token))).status).toBe(400);
    expect((await request(app).get("/stats/activity?view=month&year=2025").set(authHeader(token))).status).toBe(400);
    expect((await request(app).get("/stats/activity?view=week&date=12-03-2025").set(authHeader(token))).status).toBe(400);
    expect((await request(app).get("/stats/activity?view=wat").set(authHeader(token))).status).toBe(400);
  });

  test("view=year rechaza años fuera de rango", async () => {
    const { token } = await registerUser();
    expect((await request(app).get("/stats/activity?view=year&year=1800").set(authHeader(token))).status).toBe(400);
  });
});

describe("GET /stats?year=", () => {
  test("completed_this_year usa el año pedido", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);
    // completado en 2025 (sesiones simulando el ciclo)
    await pool.query(
      `UPDATE user_books SET status = 'completed', finished_at = '2025-06-01', started_at = '2025-01-01'
       WHERE id = $1`,
      [book.id]
    );
    await insertSession(user.id, book.id, "2025-06-01 12:00:00", 600);

    const res = await request(app).get("/stats?year=2025").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.year).toBe(2025);
    expect(res.body.completed_this_year).toBe(1);

    const other = await request(app).get("/stats?year=2024").set(authHeader(token));
    expect(other.body.completed_this_year).toBe(0);
  });
});