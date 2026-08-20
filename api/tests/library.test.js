const { app, request, resetDb, closeDb, registerUser, authHeader } = require("./helpers");

beforeEach(resetDb);
afterAll(closeDb);

const BOOK = {
  google_id: "abc123",
  title: "El nombre del viento",
  author: "Patrick Rothfuss",
  pages: 700,
};

async function addBook(token) {
  return request(app).post("/user-books").set(authHeader(token)).send(BOOK);
}

describe("POST /user-books", () => {
  test("agrega un libro a la biblioteca", async () => {
    const { token } = await registerUser();
    const res = await addBook(token);
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
  });

  test("rechaza libro sin google_id", async () => {
    const { token } = await registerUser();
    const res = await request(app).post("/user-books").set(authHeader(token)).send({ title: "X" });
    expect(res.status).toBe(400);
  });

  test("rechaza un status inválido", async () => {
    const { token } = await registerUser();
    const res = await request(app).post("/user-books").set(authHeader(token)).send({ ...BOOK, status: "no-existe" });
    expect(res.status).toBe(400);
  });

  test("permite agregar dos libros distintos con distinto google_id", async () => {
    const { token } = await registerUser();
    await addBook(token);
    const res = await request(app)
      .post("/user-books")
      .set(authHeader(token))
      .send({ ...BOOK, google_id: "otro-google" });
    expect(res.status).toBe(201);
  });
});

describe("GET /user-books", () => {
  test("lista solo los libros del usuario", async () => {
    const { token, user } = await registerUser();
    await addBook(token);

    const other = await registerUser({ username: "otro", email: "otro@example.com" });
    await request(app).post("/user-books").set(authHeader(other.token)).send({ ...BOOK, google_id: "xyz999" });

    const res = await request(app).get("/user-books").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].google_id).toBe("abc123");
  });
});

describe("PATCH /user-books/:id", () => {
  test("actualiza el estado del libro", async () => {
    const { token } = await registerUser();
    const added = await addBook(token);
    const res = await request(app)
      .patch(`/user-books/${added.body.id}`)
      .set(authHeader(token))
      .send({ status: "reading", current_page: 100 });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("reading");
    expect(res.body.current_page).toBe(100);
  });

  test("rechaza rating fuera de rango", async () => {
    const { token } = await registerUser();
    const added = await addBook(token);
    const res = await request(app)
      .patch(`/user-books/${added.body.id}`)
      .set(authHeader(token))
      .send({ rating: 9 });
    expect(res.status).toBe(400);
  });

  test("aislamiento: el usuario B no puede modificar el libro de A", async () => {
    const a = await registerUser();
    const added = await addBook(a.token);
    const b = await registerUser({ username: "b", email: "b@example.com" });
    const res = await request(app)
      .patch(`/user-books/${added.body.id}`)
      .set(authHeader(b.token))
      .send({ status: "completed" });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /user-books/:id", () => {
  test("elimina un libro propio", async () => {
    const { token } = await registerUser();
    const added = await addBook(token);
    const res = await request(app).delete(`/user-books/${added.body.id}`).set(authHeader(token));
    expect(res.status).toBe(200);
  });

  test("aislamiento: el usuario B no puede eliminar el libro de A", async () => {
    const a = await registerUser();
    const added = await addBook(a.token);
    const b = await registerUser({ username: "b", email: "b@example.com" });
    const res = await request(app).delete(`/user-books/${added.body.id}`).set(authHeader(b.token));
    expect(res.body.message).not.toBe("Libro eliminado");
    const remaining = await request(app).get("/user-books").set(authHeader(a.token));
    expect(remaining.body).toHaveLength(1);
  });
});