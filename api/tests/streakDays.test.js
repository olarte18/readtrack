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