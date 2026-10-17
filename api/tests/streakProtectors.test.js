const { app, request, pool, resetDb, closeDb, registerUser, authHeader } = require("./helpers");

beforeEach(resetDb);
afterAll(closeDb);

async function addBook(token, mode = "page") {
  const res = await request(app)
    .post("/user-books")
    .set(authHeader(token))
    .send({ google_id: "g" + Math.random(), title: "Libro", author: "Autor", pages: 300, reading_mode: mode });
  expect(res.status).toBe(201);
  return res.body;
}

function isoDaysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString();
}

async function saveSession(token, userBookId, body = {}, expectStatus = 201) {
  const res = await request(app)
    .post("/reading-sessions")
    .set(authHeader(token))
    .send({
      user_book_id: userBookId,
      page: 100,
      duration_seconds: 1800,
      pages_read: 2,
      started_at: isoDaysAgo(0),
      ...body,
    });
  expect(res.status).toBe(expectStatus);
  return res.body;
}

async function getStreak(token) {
  const res = await request(app).get("/stats/streak").set(authHeader(token));
  expect(res.status).toBe(200);
  return res.body;
}

async function getShop(token) {
  const res = await request(app).get("/streak").set(authHeader(token));
  expect(res.status).toBe(200);
  return res.body;
}

describe("puntos por sesión", () => {
  test("otorga puntos a una sesión que califica (30 min = 50)", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    const body = await saveSession(token, book.id, { duration_seconds: 1800, pages_read: 2 });
    expect(body.pointsEarned).toBe(50);
  });

  test("no otorga puntos si la sesión no califica para la racha", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    const body = await saveSession(token, book.id, { duration_seconds: 240, pages_read: 2 });
    expect(body.pointsEarned).toBe(0);
  });

  test("respeta el tope diario (500)", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    // 3 h => 300 pts; la segunda aporta solo los 200 que caben en el tope.
    const first = await saveSession(token, book.id, { duration_seconds: 10800, pages_read: 5 });
    expect(first.pointsEarned).toBe(300);
    const second = await saveSession(token, book.id, { duration_seconds: 10800, pages_read: 5 });
    expect(second.pointsEarned).toBe(200);
    const third = await saveSession(token, book.id, { duration_seconds: 3600, pages_read: 5 });
    expect(third.pointsEarned).toBe(0);
  });

  test("el reenvío idempotente devuelve los mismos puntos sin duplicar", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    const clientId = "11111111-1111-1111-1111-111111111111";
    const first = await saveSession(token, book.id, { client_id: clientId, duration_seconds: 1800, pages_read: 2 });
    expect(first.pointsEarned).toBe(50);
    const again = await saveSession(token, book.id, { client_id: clientId, duration_seconds: 1800, pages_read: 2 }, 200);
    expect(again.pointsEarned).toBe(50);

    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM streak_point_events WHERE reason = 'earn'");
    expect(rows[0].n).toBe(1);
  });
});

describe("tienda de protectores", () => {
  test("el primer acceso regala un protector y arranca con 2 ranuras", async () => {
    const { token } = await registerUser();
    const shop = await getShop(token);
    expect(shop).toMatchObject({ points: 0, cost: 400, slots: 2, owned: 1, gift_available: true, can_buy: 0 });
  });

  test("no se puede comprar sin puntos suficientes", async () => {
    const { token } = await registerUser();
    await getShop(token);
    const res = await request(app).post("/streak/buy").set(authHeader(token));
    expect(res.status).toBe(400);
  });

  test("compra un protector, descuenta puntos y llena las ranuras", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    // 5 sesiones de 1 h = 500 pts (tope diario).
    for (let i = 0; i < 5; i++) {
      await saveSession(token, book.id, { duration_seconds: 3600, pages_read: 3 });
    }
    const before = await getShop(token);
    expect(before.points).toBe(500);

    const res = await request(app).post("/streak/buy").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ points: 100, owned: 2, slots: 2, can_buy: 0 });

    // Inventario lleno: no se puede comprar otra.
    const again = await request(app).post("/streak/buy").set(authHeader(token));
    expect(again.status).toBe(409);
  });
});

describe("consumo automático en un hueco aislado", () => {
  test("protege el día intermedio, mantiene la racha y aparece en el calendario", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);

    // Día (hoy - 2): sesión que califica.
    await saveSession(token, book.id, { started_at: isoDaysAgo(2) });
    // Hoy: sesión que califica. El hueco de ayer (hoy - 1) debe cubrirse.
    await saveSession(token, book.id, { started_at: isoDaysAgo(0) });

    const streak = await getStreak(token);
    expect(streak).toMatchObject({ current: 3, best: 3 });
    expect(streak.protectors).toMatchObject({ available: 0, slots: 2 });

    // El protector consumido vuelve las ranuras a la base (2) y queda registrado.
    const { rows } = await pool.query(
      "SELECT TO_CHAR(protected_date, 'YYYY-MM-DD') AS pd, used_at FROM streak_protectors WHERE used_at IS NOT NULL"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].pd).not.toBeNull();

    // El día protegido aparece en el calendario con escudo y contando racha.
    const [y, m] = rows[0].pd.split("-").map(Number);
    const cal = await request(app).get(`/calendar/${y}/${m}`).set(authHeader(token));
    expect(cal.status).toBe(200);
    const protectedDay = cal.body.days.find((d) => d.protected === true);
    expect(protectedDay).toBeDefined();
    expect(protectedDay.counts).toBe(true);
  });
});

describe("solo protege huecos que conectan con la racha activa", () => {
  test("no gasta protectores en un hueco de una racha ya perdida", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);

    // Dos lecturas separadas por un hueco, pero sin actividad hoy ni ayer: la
    // racha ya se perdió, así que no hay nada que rescatar.
    await saveSession(token, book.id, { started_at: isoDaysAgo(3) });
    await saveSession(token, book.id, { started_at: isoDaysAgo(5) });

    const streak = await getStreak(token);
    expect(streak.current).toBe(0);
    expect(streak.protectors).toMatchObject({ available: 1 });

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM streak_protectors WHERE used_at IS NOT NULL"
    );
    expect(rows[0].n).toBe(0);
  });

  test("la reparación devuelve un protector gastado en un hueco que no conecta", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);

    // Lecturas de hoy y ayer insertadas directo en la BD: pasar por el API ya
    // dispararía la conciliación y marcaría la reparación como hecha.
    await pool.query(
      `INSERT INTO reading_sessions (user_book_id, user_id, page, duration_seconds, pages_read, started_at)
       VALUES ($1, $2, 100, 1800, 2, NOW() - interval '1 day'), ($1, $2, 100, 1800, 2, NOW())`,
      [book.id, user.id]
    );

    // Consumo histórico inválido: un protector gastado en un día suelto de hace
    // 20 días que no conecta con la racha vigente.
    const bad = new Date(Date.now() - 20 * 86400000).toISOString().slice(0, 10);
    await pool.query(
      "INSERT INTO streak_protectors (user_id, source, cost, bought_at, used_at, protected_date) VALUES ($1, 'buy', 400, NOW(), NOW(), $2::date)",
      [user.id, bad]
    );

    // Al primer acceso corre la reparación única: devuelve el protector inválido
    // (queda disponible, junto con el regalo).
    const streak = await getStreak(token);
    expect(streak.protectors).toMatchObject({ available: 2 });

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM streak_protectors WHERE used_at IS NOT NULL OR protected_date IS NOT NULL"
    );
    expect(rows[0].n).toBe(0);
  });

  test("una vez usado, siempre gastado: no se devuelve si la racha muere después", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);

    // Hueco vivo entre hace 2 días y hoy: el regalo cubre ayer.
    await saveSession(token, book.id, { started_at: isoDaysAgo(2) });
    await saveSession(token, book.id, { started_at: isoDaysAgo(0) });
    const first = await getStreak(token);
    expect(first.protectors).toMatchObject({ available: 0 });

    // La racha se pierde después (se borra la lectura de hoy): el protector ya
    // gastado NO se devuelve.
    await pool.query("DELETE FROM reading_sessions WHERE user_id = $1", [user.id]);
    const after = await getStreak(token);
    expect(after.protectors).toMatchObject({ available: 0 });

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM streak_protectors WHERE used_at IS NOT NULL"
    );
    expect(rows[0].n).toBe(1);
  });
});

describe("ranuras: bonus por mes perfecto", () => {
  test("sube +1 ranura al cerrar un mes con inventario lleno y sin usos", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);
    // Activa el estado (regalo + ranuras).
    await getShop(token);

    // Compra otro protector para llenar las 2 ranuras (400 pts = 5 sesiones de 1 h).
    for (let i = 0; i < 5; i++) {
      await saveSession(token, book.id, { duration_seconds: 3600, pages_read: 3 });
    }
    await request(app).post("/streak/buy").set(authHeader(token)); // owned 2 == slots 2

    // Retrasa los protectores y la última evaluación al mes antepasado, como si
    // el mes pasado hubiera cerrado con el inventario lleno y sin usos.
    const d = new Date();
    d.setDate(15);
    d.setMonth(d.getMonth() - 2);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    await pool.query("UPDATE streak_protectors SET bought_at = $2::timestamp WHERE user_id = $1", [user.id, `${ym}-15 12:00:00`]);
    await pool.query("UPDATE streak_protector_state SET last_eval_month = $2::date WHERE user_id = $1", [user.id, `${ym}-01`]);

    const shop = await getShop(token);
    expect(shop.slots).toBe(3);
  });
});
