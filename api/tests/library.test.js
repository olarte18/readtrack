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

  test("rechaza libro sin título", async () => {
    const { token } = await registerUser();
    const res = await request(app).post("/user-books").set(authHeader(token)).send({ google_id: "abc" });
    expect(res.status).toBe(400);
  });

  test("crea un libro manual sin google_id", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/user-books")
      .set(authHeader(token))
      .send({ title: "Cuento manual", author: "Yo", pages: 120, status: "wishlist" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("wishlist");

    const list = await request(app).get("/user-books").set(authHeader(token));
    expect(list.body).toHaveLength(1);
    expect(list.body[0].google_id).toBeNull();
    expect(list.body[0].title).toBe("Cuento manual");
  });

  test("rechaza un status inválido", async () => {
    const { token } = await registerUser();
    const res = await request(app).post("/user-books").set(authHeader(token)).send({ ...BOOK, status: "no-existe" });
    expect(res.status).toBe(400);
  });

  test("rechaza un book_type inválido", async () => {
    const { token } = await registerUser();
    const res = await request(app).post("/user-books").set(authHeader(token)).send({ ...BOOK, book_type: "manga" });
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

describe("PATCH /books/:id/pages", () => {
  test("actualiza páginas de un libro manual por su id de BD", async () => {
    const { token } = await registerUser();
    await request(app)
      .post("/user-books")
      .set(authHeader(token))
      .send({ title: "Manual con páginas", pages: 200 });
    const bookDbId = (await request(app).get("/user-books").set(authHeader(token))).body[0].db_id;

    const res = await request(app)
      .patch(`/books/${bookDbId}/pages`)
      .set(authHeader(token))
      .send({ pages: 310 });
    expect(res.status).toBe(200);
    expect(res.body.pages).toBe(310);
  });
});

describe("PATCH /books/:id (edición global de la ficha)", () => {
  async function setupBook(token) {
    const added = await addBook(token);
    const dbId = (await request(app).get("/user-books").set(authHeader(token))).body[0].db_id;
    return { bookId: added.body.id, dbId };
  }

  test("actualiza campos y se reflejan en la ficha global", async () => {
    const { token } = await registerUser();
    const { dbId } = await setupBook(token);

    const res = await request(app)
      .patch(`/books/${dbId}`)
      .set(authHeader(token))
      .send({ author: "Patrick Rothfuss (editado)", cover: "https://cdn.example.com/portada.jpg", pages: 750 });
    expect(res.status).toBe(200);

    const book = await request(app).get(`/books/${dbId}`);
    expect(book.body.author).toBe("Patrick Rothfuss (editado)");
    expect(book.body.cover).toBe("https://cdn.example.com/portada.jpg");
    expect(book.body.pages).toBe(750);
  });

  test("un campo vacío limpia el dato", async () => {
    const { token } = await registerUser();
    const { dbId } = await setupBook(token);

    await request(app).patch(`/books/${dbId}`).set(authHeader(token)).send({ isbn: "978-12345" });
    const withIsbn = await request(app).get(`/books/${dbId}`);
    expect(withIsbn.body.isbn).toBe("978-12345");

    const res = await request(app).patch(`/books/${dbId}`).set(authHeader(token)).send({ isbn: "" });
    expect(res.status).toBe(200);
    const cleared = await request(app).get(`/books/${dbId}`);
    expect(cleared.body.isbn).toBeNull();
  });

  test("rechaza título vacío", async () => {
    const { token } = await registerUser();
    const { dbId } = await setupBook(token);
    const res = await request(app).patch(`/books/${dbId}`).set(authHeader(token)).send({ title: "  " });
    expect(res.status).toBe(400);
  });

  test("rechaza book_type inválido y pages inválidas", async () => {
    const { token } = await registerUser();
    const { dbId } = await setupBook(token);

    const badType = await request(app).patch(`/books/${dbId}`).set(authHeader(token)).send({ book_type: "manga" });
    expect(badType.status).toBe(400);

    const badPages = await request(app).patch(`/books/${dbId}`).set(authHeader(token)).send({ pages: 0 });
    expect(badPages.status).toBe(400);
  });

  test("libro inexistente devuelve 404", async () => {
    const { token } = await registerUser();
    const res = await request(app).patch("/books/999999").set(authHeader(token)).send({ author: "X" });
    expect(res.status).toBe(404);
  });

  test("sin token devuelve 401", async () => {
    const { token } = await registerUser();
    const { dbId } = await setupBook(token);
    const res = await request(app).patch(`/books/${dbId}`).send({ author: "X" });
    expect(res.status).toBe(401);
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