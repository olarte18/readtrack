const { app, request, resetDb, closeDb, registerUser, authHeader } = require("./helpers");

beforeEach(resetDb);
afterAll(closeDb);

const BOOK = { google_id: "notas111", title: "Notas libro", pages: 300 };

async function setup() {
  const { token } = await registerUser();
  const added = await request(app).post("/user-books").set(authHeader(token)).send(BOOK);
  return { token, book: added.body };
}

describe("POST /notes", () => {
  test("crea una nota en un libro", async () => {
    const { token, book } = await setup();
    const res = await request(app)
      .post("/notes")
      .set(authHeader(token))
      .send({ book_id: book.book_id ?? book.id, content: "Idea brillante", page: 42 });
    expect(res.status).toBe(201);
    expect(res.body.content).toBe("Idea brillante");
  });

  test("rechaza nota sin contenido", async () => {
    const { token, book } = await setup();
    const res = await request(app)
      .post("/notes")
      .set(authHeader(token))
      .send({ book_id: book.book_id ?? book.id });
    expect(res.status).toBe(400);
  });

  test("rechaza contenido demasiado largo", async () => {
    const { token, book } = await setup();
    const res = await request(app)
      .post("/notes")
      .set(authHeader(token))
      .send({ book_id: book.book_id ?? book.id, content: "x".repeat(5001) });
    expect(res.status).toBe(400);
  });
});

describe("GET /notes/:book_id", () => {
  test("listo solo mis notas de ese libro", async () => {
    const { token, book } = await setup();
    await request(app)
      .post("/notes")
      .set(authHeader(token))
      .send({ book_id: book.book_id ?? book.id, content: "nota 1" });
    const res = await request(app).get(`/notes/${book.book_id ?? book.id}`).set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });
});

describe("DELETE /notes/:id", () => {
  test("elimina una nota propia", async () => {
    const { token, book } = await setup();
    const note = await request(app)
      .post("/notes")
      .set(authHeader(token))
      .send({ book_id: book.book_id ?? book.id, content: "nota a borrar" });
    const res = await request(app).delete(`/notes/${note.body.id}`).set(authHeader(token));
    expect(res.status).toBe(200);
  });
});