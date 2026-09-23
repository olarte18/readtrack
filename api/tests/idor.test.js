const { app, request, pool, resetDb, closeDb, registerUser, authHeader } = require("./helpers");

beforeEach(resetDb);
afterAll(closeDb);

async function addBook(token, overrides = {}) {
  const res = await request(app)
    .post("/user-books")
    .set(authHeader(token))
    .send({ google_id: `idor_${Date.now()}_${Math.random()}`, title: "Libro de la víctima", author: "Autor", pages: 300, ...overrides });
  return res.body;
}

// A = atacante, B = víctima. B tiene un libro, una sesión y una nota.
async function setup() {
  const a = await registerUser();
  const b = await registerUser({ username: "victima", email: "victima@example.com" });

  const book = await addBook(b.token);
  await pool.query(`UPDATE user_books SET status = 'completed' WHERE id = $1`, [book.id]);

  const session = await request(app)
    .post("/reading-sessions")
    .set(authHeader(b.token))
    .send({ user_book_id: book.id, page: 10, duration_seconds: 600, pages_read: 5 });

  const note = await request(app)
    .post("/notes")
    .set(authHeader(b.token))
    .send({ book_id: book.book_id, content: "nota privada de la víctima" });

  return { a, b, book, session: session.body, note: note.body };
}

describe("Recursos ajenos (IDOR)", () => {
  test("GET /user-books/:id/history de otro usuario devuelve vacío", async () => {
    const { a, book } = await setup();
    const res = await request(app).get(`/user-books/${book.id}/history`).set(authHeader(a.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("POST /user-books/:id/reread de otro usuario devuelve 404", async () => {
    const { a, book } = await setup();
    const res = await request(app)
      .post(`/user-books/${book.id}/reread`)
      .set(authHeader(a.token))
      .send({});
    expect(res.status).toBe(404);
    // La copia de la víctima sigue sin archivar
    const { rows } = await pool.query(`SELECT is_archived FROM user_books WHERE id = $1`, [book.id]);
    expect(rows[0].is_archived).toBe(false);
  });

  test("GET /notes (lista) no incluye notas ajenas", async () => {
    const { a } = await setup();
    const res = await request(app).get("/notes").set(authHeader(a.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("GET /notes/:book_id de otro usuario devuelve vacío", async () => {
    const { a, book } = await setup();
    const res = await request(app).get(`/notes/${book.book_id}`).set(authHeader(a.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  test("DELETE /notes/:id de otro usuario no borra la nota ajena", async () => {
    const { a, b, book, note } = await setup();
    const res = await request(app).delete(`/notes/${note.id}`).set(authHeader(a.token));
    expect(res.status).toBe(200);

    // La nota de la víctima sigue intacta
    const check = await request(app).get(`/notes/${book.book_id}`).set(authHeader(b.token));
    expect(check.body).toHaveLength(1);
    expect(check.body[0].content).toBe("nota privada de la víctima");
  });

  test("GET /reading-sessions/:user_book_id de otro usuario devuelve vacío", async () => {
    const { a, book, session } = await setup();
    const res = await request(app).get(`/reading-sessions/${book.id}`).set(authHeader(a.token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
    expect(session.id).toBeDefined();
  });

  test("GET /reading-sessions/:user_book_id/speed de otro usuario devuelve 404", async () => {
    const { a, book } = await setup();
    const res = await request(app).get(`/reading-sessions/${book.id}/speed`).set(authHeader(a.token));
    expect(res.status).toBe(404);
  });
});

describe("POST /reading-sessions valida la propiedad del user_book", () => {
  test("con user_book_id ajeno devuelve 404 y no inserta la sesión", async () => {
    const { a, book } = await setup();

    const res = await request(app)
      .post("/reading-sessions")
      .set(authHeader(a.token))
      .send({ user_book_id: book.id, page: 50, duration_seconds: 900, pages_read: 10 });

    expect(res.status).toBe(404);

    const { rows } = await pool.query(`SELECT COUNT(*)::int AS n FROM reading_sessions`);
    expect(rows[0].n).toBe(1); // solo la sesión original de la víctima
  });

  test("con user_book_id propio crea la sesión (control)", async () => {
    const { a } = await setup();
    const book = await addBook(a.token);

    const res = await request(app)
      .post("/reading-sessions")
      .set(authHeader(a.token))
      .send({ user_book_id: book.id, page: 20, duration_seconds: 600, pages_read: 5 });

    expect(res.status).toBe(201);
    expect(res.body.user_book_id).toBe(book.id);
    expect(res.body.user_id).toBe(a.user.id);
  });
});