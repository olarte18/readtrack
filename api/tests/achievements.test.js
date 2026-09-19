const { app, request, pool, resetDb, closeDb, registerUser, authHeader } = require("./helpers");
const { appYear } = require("../src/utils/dates");

beforeEach(resetDb);
afterAll(closeDb);

async function addBook(token, overrides = {}) {
  return request(app).post("/user-books").set(authHeader(token)).send({
    google_id: `gid-${Math.random().toString(36).slice(2)}`,
    title: "Libro",
    author: "Autor",
    pages: 200,
    genre: "Ficción",
    ...overrides,
  });
}

async function completeBook(token, id, overrides = {}) {
  return request(app)
    .patch(`/user-books/${id}`)
    .set(authHeader(token))
    .send({ status: "completed", current_page: 999, finished_at: overrides.finished_at ?? `${appYear()}-09-01`, ...overrides });
}

// created_at va en UTC; Bogotá = UTC-5 (las 12:00 de Bogotá son las 17:00 UTC).
async function addSession(token, user, userBookId, created_at, duration_seconds = 600, pages_read = 10, page = 10) {
  await pool.query(
    `INSERT INTO reading_sessions (user_book_id, user_id, page, start_page, duration_seconds, pages_read, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userBookId, user.id, page, 0, duration_seconds, pages_read, created_at]
  );
}

function findItem(res, code, tier) {
  for (const g of res.body.groups) {
    const item = g.items.find((i) => i.code === code && i.tier === tier);
    if (item) return item;
  }
  return null;
}

const allItems = (res) => res.body.groups.flatMap((g) => g.items);

describe("GET /achievements sin actividad", () => {
  test("devuelve el catálogo agrupado sin desbloqueos ni secretos", async () => {
    const { token } = await registerUser();
    const res = await request(app).get("/achievements").set(authHeader(token));

    expect(res.status).toBe(200);
    expect(res.body.unseen_count).toBe(0);
    const codes = res.body.groups.map((g) => g.code);
    expect(codes).toEqual(expect.arrayContaining(["rachas", "volumen", "variedad", "interaccion"]));
    expect(codes).not.toContain("secretos");
    const items = allItems(res);
    for (const item of items) expect(item.unlocked).toBe(false);
    expect(new Set(items.map((i) => i.code)).size).toBe(items.length);
    expect(findItem(res, "en_racha", "bronze").target).toBe(7);
  });

  test("requiere sesión", async () => {
    const res = await request(app).get("/achievements");
    expect(res.status).toBe(401);
  });
});

describe("desbloqueo por terminar libros", () => {
  test("primer libro (hito único secreto) se desbloquea al completar uno", async () => {
    const { token } = await registerUser();

    const before = await request(app).get("/achievements").set(authHeader(token));
    expect(before.body.groups.flatMap((g) => g.items.map((i) => i.code))).not.toContain("primer_libro");

    const book = await addBook(token);
    await completeBook(token, book.body.id);

    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "primer_libro", "special");
    expect(item.unlocked).toBe(true);
    expect(item.tier).toBe("special");
    expect(item.progress).toBe(1);
    expect(res.body.unseen_count).toBeGreaterThanOrEqual(1);
  });

  test("las relecturas no duplican el libro distinto", async () => {
    const { token } = await registerUser();
    const book = await addBook(token, { google_id: "relectura", title: "El nombre del viento" });
    await completeBook(token, book.body.id);
    const reread = await request(app).post(`/user-books/${book.body.id}/reread`).set(authHeader(token)).send({});
    await completeBook(token, reread.body.id);

    const res = await request(app).get("/achievements").set(authHeader(token));
    expect(findItem(res, "primer_libro", "special").progress).toBe(1);
    expect(findItem(res, "raton_biblioteca", "bronze").progress).toBe(1);
  });

  test("la meta anual sin meta configurada no se desbloquea", async () => {
    const { token } = await registerUser();
    const book = await addBook(token, { google_id: "meta" });
    await completeBook(token, book.body.id);

    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "meta_anual", "bronze");
    expect(item).toBeDefined();
    expect(item.unlocked).toBe(false);
    expect(item.target).toBeNull();
  });
});

describe("variedad: géneros y autor fiel", () => {
  test("tres libros del mismo autor de géneros distintos", async () => {
    const { token } = await registerUser();
    for (const [genre, title] of [["Fantasía", "A"], ["Ciencia ficción", "B"], ["Terror", "C"]]) {
      const book = await addBook(token, { genre, title, author: "Stephen King", google_id: `g-${title}` });
      await completeBook(token, book.body.id);
    }

    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "autor_fiel", "bronze");
    expect(item.unlocked).toBe(true);
    expect(item.progress).toBe(3);
    expect(item.target).toBe(6);
    expect(item.next_tier).toBe(true);
    expect(findItem(res, "explorador", "bronze").unlocked).toBe(false);
    expect(findItem(res, "explorador", "bronze").progress).toBe(3);
  });
});

describe("maratonista por páginas de sesiones", () => {
  test("5000 páginas desbloquean bronce y apunta a las 15000", async () => {
    const { token, user } = await registerUser();
    const book = await pool.query(
      "INSERT INTO books (title, author, pages, genre) VALUES ($1, $2, $3, $4) RETURNING id",
      ["Saga", "Autor", 10000, "Ficción"]
    );
    const ub = await pool.query(
      "INSERT INTO user_books (book_id, user_id, status) VALUES ($1, $2, 'completed') RETURNING id",
      [book.rows[0].id, user.id]
    );
    for (let i = 0; i < 2; i++) {
      await addSession(token, user, ub.rows[0].id, `2026-01-0${i + 1} 17:00:00`, 1800, 5000, 5000);
    }

    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "maratonista", "bronze");
    expect(item.unlocked).toBe(true);
    expect(item.progress).toBe(10000);
    expect(item.target).toBe(15000);
    expect(item.next_tier).toBe(true);
  });
});

describe("una sola insignia por logro", () => {
  const STREAK_START = Date.UTC(2026, 8, 1);

  async function seedStreakDays(token, user, days) {
    const book = await pool.query("INSERT INTO books (title, author, genre) VALUES ($1,$2,$3) RETURNING id", ["Libro", "Autor", "Ficción"]);
    const ub = await pool.query("INSERT INTO user_books (book_id, user_id) VALUES ($1,$2) RETURNING id", [book.rows[0].id, user.id]);
    for (let i = 0; i < days; i++) {
      const d = new Date(STREAK_START + i * 86400000);
      const ds = d.toISOString().slice(0, 10);
      await addSession(token, user, ub.rows[0].id, `${ds} 17:00:00`);
    }
    return ub.rows[0].id;
  }

  test("bloqueada: muestra progreso al primer umbral", async () => {
    const { token, user } = await registerUser();
    await seedStreakDays(token, user, 2);

    const res = await request(app).get("/achievements").set(authHeader(token));
    expect(allItems(res).filter((i) => i.code === "en_racha")).toHaveLength(1);
    const item = findItem(res, "en_racha", "bronze");
    expect(item.unlocked).toBe(false);
    expect(item.target).toBe(7);
    expect(item.progress).toBe(2);
    expect(item.next_tier).toBe(false);
  });

  test("desbloqueada: muestra la más alta conseguida y cuánto falta", async () => {
    const { token, user } = await registerUser();
    await seedStreakDays(token, user, 30);

    const res = await request(app).get("/achievements").set(authHeader(token));
    const items = allItems(res);
    expect(items.filter((i) => i.code === "en_racha")).toHaveLength(1);
    expect(items.some((i) => i.code === "en_racha" && i.tier === "bronze")).toBe(false);
    const item = findItem(res, "en_racha", "silver");
    expect(item.unlocked).toBe(true);
    expect(item.target).toBe(100);
    expect(item.progress).toBe(30);
    expect(item.next_tier).toBe(true);
  });

  test("al llegar al máximo (250) la insignia es especial y no queda cuánto falta", async () => {
    const { token, user } = await registerUser();
    await seedStreakDays(token, user, 250);

    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "en_racha", "special");
    expect(item.unlocked).toBe(true);
    expect(item.target).toBe(250);
    expect(item.progress).toBe(250);
    expect(item.next_tier).toBe(false);
  });

  test("el final (250) es secreto: al llegar al oro no se revela su umbral", async () => {
    const { token, user } = await registerUser();
    await seedStreakDays(token, user, 100);

    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "en_racha", "gold");
    expect(item.unlocked).toBe(true);
    expect(item.target).toBe(100);
    expect(item.progress).toBe(100);
    expect(item.next_tier).toBe(false);
    expect(res.body.groups.map((g) => g.code)).not.toContain("secretos");
  });
});

describe("interacción: crítico y anotador", () => {
  test("crítico: 10 libros calificados desbloquean bronce", async () => {
    const { token, user } = await registerUser();
    for (let i = 0; i < 10; i++) {
      const b = await pool.query(
        "INSERT INTO books (title, author, pages, genre) VALUES ($1,$2,$3,$4) RETURNING id",
        [`Libro ${i}`, "Mismo autor", 100, "Ficción"]
      );
      await pool.query(
        "INSERT INTO user_books (book_id, user_id, status, rating, finished_at) VALUES ($1,$2,'completed',$3,$4)",
        [b.rows[0].id, user.id, 5, `${appYear()}-0${(i % 9) + 1}-02`]
      );
    }

    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "critico", "bronze");
    expect(item.unlocked).toBe(true);
    expect(item.progress).toBe(10);
  });

  test("anotador: 20 notas desbloquean bronce", async () => {
    const { token, user } = await registerUser();
    const book = await pool.query("INSERT INTO books (title, author, genre) VALUES ($1,$2,$3) RETURNING id", ["Libro", "Autor", "Ficción"]);
    const ub = await pool.query("INSERT INTO user_books (book_id, user_id) VALUES ($1,$2) RETURNING id", [book.rows[0].id, user.id]);
    for (let i = 1; i <= 20; i++) {
      await pool.query(
        "INSERT INTO notes (book_id, user_id, user_book_id, content, page) VALUES ($1,$2,$3,$4,$5)",
        [book.rows[0].id, user.id, ub.rows[0].id, `Nota ${i}`, i]
      );
    }

    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "anotador", "bronze");
    expect(item.unlocked).toBe(true);
    expect(item.progress).toBe(20);
  });
});

describe("logros secretos", () => {
  test("mes perfecto no aparece hasta cumplir el mes completo", async () => {
    const { token, user } = await registerUser();
    const book = await pool.query("INSERT INTO books (title, author, genre) VALUES ($1,$2,$3) RETURNING id", ["Libro", "Autor", "Ficción"]);
    const ub = await pool.query("INSERT INTO user_books (book_id, user_id) VALUES ($1,$2) RETURNING id", [book.rows[0].id, user.id]);

    // Febrero 2026 tiene 28 días; 12:00 Bogotá = 17:00 UTC del mismo día.
    for (let dd = 1; dd <= 27; dd++) {
      await addSession(token, user, ub.rows[0].id, `2026-02-${String(dd).padStart(2, "0")} 17:00:00`, 600, 5);
    }
    let res = await request(app).get("/achievements").set(authHeader(token));
    expect(allItems(res).some((i) => i.code === "mes_perfecto")).toBe(false);

    await addSession(token, user, ub.rows[0].id, "2026-02-28 17:00:00", 600, 5);
    res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "mes_perfecto", "special");
    expect(item).toBeDefined();
    expect(item.unlocked).toBe(true);
  });

  test("dedicación se desbloquea con 3 horas en un día", async () => {
    const { token, user } = await registerUser();
    const book = await pool.query("INSERT INTO books (title, author, genre) VALUES ($1,$2,$3) RETURNING id", ["Libro", "Autor", "Ficción"]);
    const ub = await pool.query("INSERT INTO user_books (book_id, user_id) VALUES ($1,$2) RETURNING id", [book.rows[0].id, user.id]);
    await addSession(token, user, ub.rows[0].id, "2026-09-10 17:00:00", 10800, 100);

    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "dedicacion", "special");
    expect(item).toBeDefined();
    expect(item.unlocked).toBe(true);
  });
});

describe("seen y meta_anual", () => {
  test("marked seen limpia unseen_count y los items quedan vistos", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await completeBook(token, book.body.id);

    const first = await request(app).get("/achievements").set(authHeader(token));
    expect(first.body.unseen_count).toBeGreaterThanOrEqual(1);

    const seen = await request(app).post("/achievements/seen").set(authHeader(token)).send({});
    expect(seen.status).toBe(200);
    expect(seen.body.ok).toBe(true);
    expect(seen.body.marked).toBe(first.body.unseen_count);

    const second = await request(app).get("/achievements").set(authHeader(token));
    expect(second.body.unseen_count).toBe(0);
    for (const item of allItems(second)) {
      if (item.unlocked) expect(item.seen).toBe(true);
    }
  });

  test("meta anual usa el valor configurado del año", async () => {
    const { token } = await registerUser();
    await request(app).post("/goals").set(authHeader(token)).send({ type: "annual", metric: "books", value: 2 });

    for (let i = 0; i < 2; i++) {
      const book = await addBook(token, { google_id: `meta-${i}` });
      await completeBook(token, book.body.id);
    }

    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "meta_anual", "bronze");
    expect(item.unlocked).toBe(true);
    expect(item.target).toBe(2);
    expect(item.progress).toBe(2);
  });
});

describe("idempotencia y aislamiento", () => {
  test("dos GET seguidos no duplican desbloqueos", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await completeBook(token, book.body.id);

    const a = await request(app).get("/achievements").set(authHeader(token));
    const b = await request(app).get("/achievements").set(authHeader(token));
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body.unseen_count).toBe(a.body.unseen_count);

    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n FROM user_achievements WHERE user_id = (SELECT id FROM users LIMIT 1)"
    );
    expect(rows[0].n).toBe(a.body.unseen_count);
  });

  test("el usuario B no ve los logros de A", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await completeBook(token, book.body.id);

    const b = await registerUser({ username: "b", email: "b@example.com" });
    const res = await request(app).get("/achievements").set(authHeader(b.token));
    for (const item of allItems(res)) expect(item.unlocked).toBe(false);
  });
});

describe("maratón de fin de semana", () => {
  test("solo suman las sesiones de sábado o domingo", async () => {
    const { token, user } = await registerUser();
    const book = await addBook(token);
    // 1000 páginas un lunes: NO cuentan.
    await addSession(token, user, book.body.id, "2026-09-07 17:00:00", 600, 1000, 1000);
    // 60 páginas entre sábado y domingo: sí.
    await addSession(token, user, book.body.id, "2026-09-05 17:00:00", 600, 30, 30);
    await addSession(token, user, book.body.id, "2026-09-06 17:00:00", 600, 30, 60);

    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "maraton_fin_de_semana", "bronze");
    expect(item.progress).toBe(60);
    expect(item.unlocked).toBe(true);
    expect(item.target).toBe(150);
    expect(item.next_tier).toBe(true);
  });
});

describe("tomo pesado y lectura exprés", () => {
  test("tomo pesado: 3 libros de 600 páginas", async () => {
    const { token } = await registerUser();
    for (let i = 0; i < 3; i++) {
      const book = await addBook(token, { pages: 600, title: `Ladrillo ${i}` });
      await completeBook(token, book.body.id);
    }

    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "tomo_pesado", "bronze");
    expect(item.unlocked).toBe(true);
    expect(item.progress).toBe(3);
    expect(item.target).toBe(7);
    expect(item.next_tier).toBe(true);
  });

  test("dos libros de 600 páginas aún no llegan al bronce", async () => {
    const { token } = await registerUser();
    for (let i = 0; i < 2; i++) {
      const book = await addBook(token, { pages: 600, title: `Ladrillo ${i}` });
      await completeBook(token, book.body.id);
    }

    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "tomo_pesado", "bronze");
    expect(item.unlocked).toBe(false);
    expect(item.progress).toBe(2);
    expect(item.target).toBe(3);
  });

  test("un libro de 200 páginas no cuenta como tomo pesado ni exprés", async () => {
    const { token } = await registerUser();
    const book = await addBook(token); // 200 páginas por defecto
    await completeBook(token, book.body.id);

    const res = await request(app).get("/achievements").set(authHeader(token));
    expect(findItem(res, "tomo_pesado", "bronze").progress).toBe(0);
    expect(findItem(res, "lectura_expres", "bronze").progress).toBe(0);
  });

  test("lectura exprés: 3 libros de menos de 150 páginas", async () => {
    const { token } = await registerUser();
    for (let i = 0; i < 3; i++) {
      const book = await addBook(token, { pages: 100, title: `Corto ${i}` });
      await completeBook(token, book.body.id);
    }

    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "lectura_expres", "bronze");
    expect(item.unlocked).toBe(true);
    expect(item.progress).toBe(3);
    expect(item.target).toBe(10);
  });
});

describe("retroalimentación: editar rating de libros terminados", () => {
  test("5 ediciones de calificación desbloquean bronce", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await completeBook(token, book.body.id);

    for (let r = 1; r <= 5; r++) {
      const res = await request(app)
        .patch(`/user-books/${book.body.id}`)
        .set(authHeader(token))
        .send({ rating: r });
      expect(res.status).toBe(200);
    }

    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "retroalimentacion", "bronze");
    expect(item.progress).toBe(5);
    expect(item.unlocked).toBe(true);
    expect(item.target).toBe(20);
    expect(item.next_tier).toBe(true);
    expect(item.leyenda).toBe("Vuelves a tus palabras para afinarlas.");
  });

  test("volver a enviar la misma calificación no cuenta", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await completeBook(token, book.body.id);

    for (let i = 0; i < 3; i++) {
      await request(app)
        .patch(`/user-books/${book.body.id}`)
        .set(authHeader(token))
        .send({ rating: 4 });
    }

    const res = await request(app).get("/achievements").set(authHeader(token));
    expect(findItem(res, "retroalimentacion", "bronze").progress).toBe(1);
  });
});

describe("abandono con estilo", () => {
  test("marcar un libro como abandonado desbloquea el logro secreto", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await completeBook(token, book.body.id);

    const res0 = await request(app).get("/achievements").set(authHeader(token));
    expect(res0.body.groups.map((g) => g.code)).not.toContain("secretos");

    const res = await request(app)
      .patch(`/user-books/${book.body.id}`)
      .set(authHeader(token))
      .send({ status: "abandoned" });
    expect(res.status).toBe(200);

    const ach = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(ach, "abandono", "special");
    expect(item).toBeDefined();
    expect(item.unlocked).toBe(true);
    expect(item.leyenda).toBe("Leer también es dejar ir.");
    expect(ach.body.groups.map((g) => g.code)).toContain("secretos");
  });

  test("la leyenda viaja en el payload de los logros", async () => {
    const { token } = await registerUser();
    const res = await request(app).get("/achievements").set(authHeader(token));
    const item = findItem(res, "maraton_fin_de_semana", "bronze");
    expect(item.leyenda).toBe("El fin de semana fue tuyo y de tu libro.");
  });
});

describe("celebración inmediata (new_achievements)", () => {
  test("completar un libro devuelve el logro recién desbloqueado", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    const res = await completeBook(token, book.body.id);

    expect(res.status).toBe(200);
    const fresh = res.body.new_achievements;
    expect(Array.isArray(fresh)).toBe(true);
    const primer = fresh.find((i) => i.code === "primer_libro");
    expect(primer).toBeDefined();
    expect(primer.tier).toBe("special");
    expect(primer.leyenda).toBe("Cada historia comienza por la primera.");
    expect(primer.unlocked_at).toBeTruthy();
  });

  test("guardar una sesión devuelve new_achievements al desbloquear", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    const res = await request(app)
      .post("/reading-sessions")
      .set(authHeader(token))
      .send({ user_book_id: book.body.id, page: 5000, duration_seconds: 3600, pages_read: 5000 });

    expect(res.status).toBe(201);
    const fresh = res.body.new_achievements ?? [];
    expect(fresh.some((i) => i.code === "maratonista")).toBe(true);
  });

  test("una acción sin logros nuevos no trae new_achievements", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await completeBook(token, book.body.id); // desbloquea primer_libro

    const res = await request(app)
      .patch(`/user-books/${book.body.id}`)
      .set(authHeader(token))
      .send({ rating: 4 });

    expect(res.status).toBe(200);
    expect(res.body.new_achievements).toBeUndefined();
  });

  test("editar la calificación de un libro terminado devuelve retroalimentación", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    await completeBook(token, book.body.id);

    let res;
    for (let r = 1; r <= 5; r++) {
      res = await request(app)
        .patch(`/user-books/${book.body.id}`)
        .set(authHeader(token))
        .send({ rating: r });
    }

    const fresh = res.body.new_achievements ?? [];
    expect(fresh.some((i) => i.code === "retroalimentacion")).toBe(true);
  });
});