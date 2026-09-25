const { app, request, pool, resetDb, closeDb, registerUser, authHeader } = require("./helpers");

beforeEach(resetDb);
afterAll(closeDb);

async function seedUserBook(userId, { title = "Libro", mode, pages = null, chapters = null }) {
  const { rows: [b] } = await pool.query(
    "INSERT INTO books (title, author, genre, pages, chapters) VALUES ($1,$2,$3,$4,$5) RETURNING id",
    [title, "Autor", "Ficción", pages, chapters]
  );
  const { rows: [ub] } = await pool.query(
    "INSERT INTO user_books (book_id, user_id, reading_mode) VALUES ($1,$2,$3) RETURNING id",
    [b.id, userId, mode]
  );
  return ub.id;
}

async function insertSession(
  userBookId,
  userId,
  { page, start_page = page, duration_seconds, pages_read = null, created_at = null }
) {
  await pool.query(
    `INSERT INTO reading_sessions (user_book_id, user_id, page, start_page, duration_seconds, pages_read, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7::timestamp, NOW()))`,
    [userBookId, userId, page, start_page, duration_seconds, pages_read, created_at]
  );
}

async function getStreak(token) {
  const res = await request(app).get("/stats/streak").set(authHeader(token));
  expect(res.status).toBe(200);
  return res.body;
}

describe("regla de día de racha según modo (streakDays)", () => {
  test("page: 5 min y 2 páginas cuenta el día", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "page", pages: 300 });
    await insertSession(ub, user.id, { page: 12, start_page: 10, duration_seconds: 360 });

    expect(await getStreak(token)).toMatchObject({ current: 1, best: 1 });
  });

  test("page: menos de 5 min NO cuenta aunque avance 2 páginas", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "page", pages: 300 });
    await insertSession(ub, user.id, { page: 12, start_page: 10, duration_seconds: 240 });

    expect(await getStreak(token)).toMatchObject({ current: 0, best: 0 });
  });

  test("page: 5 min pero solo 1 página NO cuenta", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "page", pages: 300 });
    await insertSession(ub, user.id, { page: 11, start_page: 10, duration_seconds: 360 });

    expect(await getStreak(token)).toMatchObject({ current: 0, best: 0 });
  });

  test("percentage: 7 min sin avance cuenta el día", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "percentage", pages: 300 });
    await insertSession(ub, user.id, { page: 45, duration_seconds: 420 });

    expect(await getStreak(token)).toMatchObject({ current: 1, best: 1 });
  });

  test("percentage: menos de 7 min NO cuenta aunque avance", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "percentage", pages: 300 });
    await insertSession(ub, user.id, { page: 45, duration_seconds: 360 });

    expect(await getStreak(token)).toMatchObject({ current: 0, best: 0 });
  });

  test("percentage sin páginas declaradas: 7 min cuenta igual", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "percentage" });
    await insertSession(ub, user.id, { page: 10, duration_seconds: 420 });

    expect(await getStreak(token)).toMatchObject({ current: 1, best: 1 });
  });

  test("chapter: 7 min sin avance cuenta el día", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "chapter", pages: 300, chapters: 12 });
    await insertSession(ub, user.id, { page: 3, duration_seconds: 420 });

    expect(await getStreak(token)).toMatchObject({ current: 1, best: 1 });
  });

  test("chapter: menos de 7 min NO cuenta", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "chapter", pages: 300, chapters: 12 });
    await insertSession(ub, user.id, { page: 3, duration_seconds: 360 });

    expect(await getStreak(token)).toMatchObject({ current: 0, best: 0 });
  });

  test("suma del día: 3+3 min y 1+1 página sí cuentan", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "page", pages: 300 });
    await insertSession(ub, user.id, { page: 6, start_page: 5, duration_seconds: 180 });
    await insertSession(ub, user.id, { page: 8, start_page: 7, duration_seconds: 180 });

    expect(await getStreak(token)).toMatchObject({ current: 1, best: 1 });
  });

  test("suma del día: no alcanza el mínimo aunque haya varias sesiones", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "page", pages: 300 });
    await insertSession(ub, user.id, { page: 6, start_page: 5, duration_seconds: 120 });
    await insertSession(ub, user.id, { page: 8, start_page: 7, duration_seconds: 120 });

    expect(await getStreak(token)).toMatchObject({ current: 0, best: 0 });
  });

  test("día mixto: un solo grupo que cumple hace contar el día", async () => {
    const { token, user } = await registerUser();
    const pageUb = await seedUserBook(user.id, { mode: "page", pages: 300 });
    const pctUb = await seedUserBook(user.id, { mode: "percentage", pages: 300 });
    await insertSession(pageUb, user.id, { page: 5, start_page: 5, duration_seconds: 120 });
    await insertSession(pctUb, user.id, { page: 20, duration_seconds: 420 });

    expect(await getStreak(token)).toMatchObject({ current: 1, best: 1 });
  });

  test("histérico: sesión corta anterior al corte aún cuenta el día", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "page", pages: 300 });
    await insertSession(ub, user.id, {
      page: 10,
      start_page: 9,
      duration_seconds: 30,
      created_at: "1999-12-31 23:59:00",
    });

    const res = await getStreak(token);
    expect(res.best).toBe(1);
  });
});

// Feedback para el UX: /stats/streak ahora distingue "hubo una sesión hoy"
// (hasSessionToday) de "hoy califica para la racha" (todayCounts); así el
// flame solo se enciende cuando el día suma de verdad.
describe("todayCounts en /stats/streak", () => {
  async function addBook(token, mode = "page") {
    const res = await request(app)
      .post("/user-books")
      .set(authHeader(token))
      .send({ google_id: "g" + Math.random(), title: "Libro", author: "Autor", pages: 300, reading_mode: mode });
    expect(res.status).toBe(201);
    return res.body;
  }

  async function saveSession(token, userBookId, body) {
    const res = await request(app)
      .post("/reading-sessions")
      .set(authHeader(token))
      .send({ user_book_id: userBookId, page: 100, duration_seconds: 1800, pages_read: 0, ...body });
    expect(res.status).toBe(201);
    return res.body;
  }

  test("sin sesiones: ni hasSessionToday ni todayCounts", async () => {
    const { token } = await registerUser();
    expect(await getStreak(token)).toMatchObject({ hasSessionToday: false, todayCounts: false });
  });

  test("sesión que no califica: hasSessionToday=true, todayCounts=false", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await saveSession(token, book.id, { duration_seconds: 120, pages_read: 0 });

    expect(await getStreak(token)).toMatchObject({ hasSessionToday: true, todayCounts: false });
  });

  test("sesión que sí califica: todayCounts=true e invalida la caché previa", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);

    // Primera lectura consulta la API (queda cacheada 60s con hoy NO calificando).
    expect(await getStreak(token)).toMatchObject({ todayCounts: false });
    await saveSession(token, book.id, { duration_seconds: 360, pages_read: 2 });

    // Guardar la sesión invalida stats:<uid>:*; la siguiente lectura debe
    // ver hoy calificando (si la invalidación fallara volvería la caché vieja).
    expect(await getStreak(token)).toMatchObject({ todayCounts: true, hasSessionToday: true, current: 1 });
  });
});