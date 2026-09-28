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
  { page, start_page = page, duration_seconds, pages_read = null, created_at = null, started_at = null }
) {
  // Por defecto hoy a las 12:00 Bogotá (=17:00 UTC): lejos de la medianoche
  // para que una sesión no cruce el borde del día por accidente.
  let createdAt = created_at;
  if (createdAt === null) {
    const { rows } = await pool.query(
      `SELECT TO_CHAR(NOW() AT TIME ZONE 'America/Bogota', 'YYYY-MM-DD') AS d`
    );
    createdAt = `${rows[0].d} 17:00:00`;
  }
  await pool.query(
    `INSERT INTO reading_sessions (user_book_id, user_id, page, start_page, duration_seconds, pages_read, created_at, started_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7::timestamp,$8::timestamp)`,
    [userBookId, userId, page, start_page, duration_seconds, pages_read, createdAt, started_at]
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
    // Antes del corte de la regla (en tests: 2000-01-01 00:00 UTC). Se usa una
    // fecha con margen holgado para que nunca se corra el borde por la zona
    // horaria del host.
    await insertSession(ub, user.id, {
      page: 10,
      start_page: 9,
      duration_seconds: 30,
      created_at: "1999-12-29 12:00:00",
    });

    const res = await getStreak(token);
    expect(res.best).toBe(1);
  });

  test("histérico: sesión sin duración (NULL) anterior al corte aún cuenta el día", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "page", pages: 300 });
    // duration_seconds NULL: el lapso no se puede medir (0 s), pero la sesión
    // existió. Por grandfathered su día debe contar igual que antes del deploy.
    await insertSession(ub, user.id, {
      page: 10,
      start_page: 9,
      duration_seconds: null,
      created_at: "1999-12-29 12:00:00",
      started_at: "1999-12-29 12:00:00",
    });

    expect((await getStreak(token)).best).toBe(1);
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
      .send({
        user_book_id: userBookId,
        page: 100,
        duration_seconds: 1800,
        pages_read: 0,
        // started_at hace ~10s atrás: el lapso cae entero en hoy aunque la suite
        // corra cerca de la medianoche de Bogotá.
        started_at: new Date(Date.now() - 10000).toISOString(),
        ...body,
      });
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

// Sesiones que cruzan la medianoche de Bogotá: reparten tiempo y páginas entre
// los días que tocan en vez de regalar todo al día del created_at. Las marcas
// se guardan en UTC "naive": 23:30 Bogotá del día D = 04:30 UTC del D+1.
// Fechas de octubre 2026: posteriores al corte de la regla (no grandfathered).
describe("sesiones que cruzan la medianoche (sessionDays)", () => {
  // 23:30 (02/10) -> 00:30 (03/10) en Bogotá.
  const START_2330 = "2026-10-03 04:30:00"; // = 02/10 23:30 Bogotá
  const CREATED_0030 = "2026-10-03 05:30:00"; // = 03/10 00:30 Bogotá

  test("60 min y 4 páginas cruzando: 2+2 páginas y ambos días cuentan", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "page", pages: 300 });
    await insertSession(ub, user.id, {
      page: 104,
      start_page: 100,
      duration_seconds: 3600,
      created_at: CREATED_0030,
      started_at: START_2330,
    });

    expect(await getStreak(token)).toMatchObject({ current: 0, best: 2 });
  });

  test("la contigüidad entre días no se rompe al cruzar", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "page", pages: 300 });
    await insertSession(ub, user.id, {
      page: 12,
      start_page: 10,
      duration_seconds: 360,
      created_at: "2026-10-01 17:00:00", // 12:00 Bogotá del 01/10
    });
    await insertSession(ub, user.id, {
      page: 104,
      start_page: 100,
      duration_seconds: 3600,
      created_at: CREATED_0030,
      started_at: START_2330,
    });

    // Días 01, 02 y 03 consecutivos -> best 3.
    expect(await getStreak(token)).toMatchObject({ current: 0, best: 3 });
  });

  test("sin started_at: la sesión íntegra cuenta el día de created_at (historial estable)", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "page", pages: 300 });
    // Cruzaría la medianoche si se derivara el inicio (created_at − duración),
    // pero al no haber started_at NO se parte: todo va al día de created_at
    // (03/10 00:30 Bogotá) y un solo día califica.
    await insertSession(ub, user.id, {
      page: 104,
      start_page: 100,
      duration_seconds: 3600,
      created_at: CREATED_0030, // sin started_at
    });

    expect(await getStreak(token)).toMatchObject({ current: 0, best: 1 });
  });

  test("sin duración tras el corte: el día aparece pero NO califica (0 min)", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "page", pages: 300 });
    // Post-corte: una sesión sin minutos no puede regalar el día de racha.
    await insertSession(ub, user.id, {
      page: 104,
      start_page: 100,
      duration_seconds: null,
      created_at: "2026-10-03 17:00:00",
      started_at: "2026-10-03 17:00:00",
    });

    expect(await getStreak(token)).toMatchObject({ current: 0, best: 0 });
  });

  test("reparto con mayor resto: 100 min y 4 páginas dan 5+3", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "page", pages: 300 });
    // 23:00 (03/10) -> 00:40 (04/10) Bogotá: 60 min y luego 40 min.
    await insertSession(ub, user.id, {
      page: 108,
      start_page: 100,
      duration_seconds: 6000,
      created_at: "2026-10-04 05:40:00", // = 04/10 00:40 Bogotá
      started_at: "2026-10-04 04:00:00", // = 03/10 23:00 Bogotá
    });

    // Ambos días califican (5p/60min y 3p/40min) -> best 2.
    expect(await getStreak(token)).toMatchObject({ current: 0, best: 2 });
  });

  test("páginas que se parten por la mitad: cada día cuenta las suyas, sin duplicar", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "page", pages: 300 });
    // 2 páginas en 60 min: cada día se queda con 1 -> ningún día califica.
    await insertSession(ub, user.id, {
      page: 102,
      start_page: 100,
      duration_seconds: 3600,
      created_at: "2026-10-05 05:30:00", // = 05/10 00:30 Bogotá
      started_at: "2026-10-05 04:30:00", // = 04/10 23:30 Bogotá
    });

    expect(await getStreak(token)).toMatchObject({ current: 0, best: 0 });
  });

  test("sesión que termina justo a medianoche queda entera en el día anterior", async () => {
    const { token, user } = await registerUser();
    const ub = await seedUserBook(user.id, { mode: "page", pages: 300 });
    // 23:00 -> 00:00 exacto.
    await insertSession(ub, user.id, {
      page: 104,
      start_page: 100,
      duration_seconds: 3600,
      created_at: "2026-10-06 05:00:00", // = 06/10 00:00 Bogotá
      started_at: "2026-10-06 04:00:00", // = 05/10 23:00 Bogotá
    });

    expect(await getStreak(token)).toMatchObject({ current: 0, best: 1 });
  });
});