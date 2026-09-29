const { app, request, resetDb, closeDb, registerUser, authHeader } = require("./helpers");

beforeEach(resetDb);
afterAll(closeDb);

const CURRENT_YEAR = new Date().getFullYear();

const PLAN = {
  schemaVersion: 1,
  exportedAt: new Date().toISOString(),
  books: [
    {
      bid: "u1",
      googleId: "gid1",
      title: "El quijote",
      author: "Cervantes",
      cover: "https://ejemplo.com/quijote.jpg",
      pages: 1000,
      year: "1605",
      description: "Un hidalgo...",
      publisher: "Editorial",
      bookType: "Fiction",
      status: "completed",
      currentPage: 1000,
      rating: 5,
      startedAt: "2026-01-05",
      finishedAt: "2026-02-10",
      review: "Clásico",
      readingMode: "page",
      isArchived: false,
      createdAtMs: Date.parse("2026-01-04T12:00:00Z"),
      categories: [
        { name: "Clásicos", isPrimary: true },
        { name: "Español", isPrimary: false },
      ],
      cycles: [
        { nth: 1, startedAt: "2026-01-05", finishedAt: "2026-02-10", rating: 5, review: "Clásico" },
      ],
      sessionDays: [
        {
          createdAtMs: Date.parse("2026-01-06T22:00:00Z"),
          durationSec: 1800,
          pagesRead: 100,
          page: 100,
          startPage: 0,
          clientId: "00000000-0000-0000-0000-000000000001",
        },
      ],
    },
    {
      bid: "u2",
      title: "Libro archivado",
      author: "Autor",
      pages: 200,
      status: "reading",
      currentPage: 30,
      rating: null,
      startedAt: "2026-01-01",
      finishedAt: null,
      review: null,
      readingMode: "chapter",
      isArchived: true,
      createdAtMs: null,
      categories: [],
      cycles: [],
      sessionDays: [],
    },
  ],
  notes: [
    { bid: "u1", content: "Nota de prueba", page: 100, createdAtMs: Date.parse("2026-01-07T12:00:00Z") },
    { bid: "u2", content: "Nota del archivado", page: null, createdAtMs: null },
  ],
  goals: [
    { type: "annual", metric: "books", value: 12, year: 2026 },
    { type: "daily", metric: "minutes", value: 25, year: CURRENT_YEAR },
  ],
};

async function seedLibrary(token) {
  return request(app).post("/import/readtrack").set(authHeader(token)).send({ plan: PLAN });
}

describe("GET /export", () => {
  test("exige autenticación", async () => {
    const res = await request(app).get("/export");
    expect(res.status).toBe(401);
  });

  test("devuelve un respaldo vacío para un usuario recién creado", async () => {
    const { token } = await registerUser();
    const res = await request(app).get("/export").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.schemaVersion).toBe(1);
    expect(res.body.books).toEqual([]);
    expect(res.body.notes).toEqual([]);
    expect(res.body.goals).toEqual([]);
  });

  test("exporta biblioteca con archivados, sesiones, notas y metas", async () => {
    const { token } = await registerUser();
    await seedLibrary(token);

    const res = await request(app).get("/export").set(authHeader(token));
    expect(res.status).toBe(200);
    expect(res.body.books).toHaveLength(2);

    const quijote = res.body.books.find((b) => b.bid === "u1");
    expect(quijote.title).toBe("El quijote");
    expect(quijote.status).toBe("completed");
    expect(quijote.currentPage).toBe(1000);
    expect(quijote.rating).toBe(5);
    expect(quijote.readingMode).toBe("page");
    expect(quijote.isArchived).toBe(false);
    expect(quijote.startedAt).toBe("2026-01-05");
    expect(quijote.categories).toEqual([
      { name: "Clásicos", isPrimary: true },
      { name: "Español", isPrimary: false },
    ]);
    expect(quijote.cycles).toHaveLength(1);
    expect(quijote.cycles[0].rating).toBe(5);
    expect(quijote.sessionDays).toHaveLength(1);
    expect(quijote.sessionDays[0]).toMatchObject({
      durationSec: 1800,
      pagesRead: 100,
      page: 100,
      startPage: 0,
      clientId: "00000000-0000-0000-0000-000000000001",
    });
    expect(quijote.sessionDays[0].createdAtMs).toBe(Date.parse("2026-01-06T22:00:00Z"));
    expect(quijote.sessionDays[0].startMs).toBeNull();

    const archived = res.body.books.find((b) => b.title === "Libro archivado");
    expect(archived.isArchived).toBe(true);
    expect(archived.readingMode).toBe("chapter");
    expect(archived.currentPage).toBe(30);

    expect(res.body.notes).toHaveLength(2);
    const note = res.body.notes.find((n) => n.bid === "u1");
    expect(note.content).toBe("Nota de prueba");
    expect(note.page).toBe(100);
    const archivedNote = res.body.notes.find((n) => n.bid === "u2");
    expect(archivedNote.page).toBeNull();
    expect(archivedNote.createdAtMs).toBeNull();

    expect(res.body.goals).toContainEqual({ type: "annual", metric: "books", value: 12, year: 2026 });
    expect(res.body.goals).toContainEqual({ type: "daily", metric: "minutes", value: 25, year: CURRENT_YEAR });
  });
});

describe("round-trip export → import", () => {
  test("re-importar el respaldo exportado no duplica nada", async () => {
    const { token } = await registerUser();
    await seedLibrary(token);

    const exported = await request(app).get("/export").set(authHeader(token));
    const restored = await request(app)
      .post("/import/readtrack")
      .set(authHeader(token))
      .send({ plan: exported.body });

    expect(restored.status).toBe(200);
    expect(restored.body.booksMerged).toBe(2);
    expect(restored.body.imported).toBe(2);
    expect(restored.body.sessions).toBe(0);
    expect(restored.body.notes).toBe(0);
    expect(restored.body.goals).toBe(2);

    const again = await request(app).get("/export").set(authHeader(token));
    expect(again.body.books).toHaveLength(2);
    expect(again.body.notes).toHaveLength(2);
    expect(again.body.books.find((b) => b.bid === "u1").sessionDays).toHaveLength(1);
    expect(again.body.books.find((b) => b.title === "Libro archivado").isArchived).toBe(true);
  });

  test("restaurar en otra cuenta trae el mismo contenido", async () => {
    const one = await registerUser({ username: "origen", email: "origen@example.com" });
    await seedLibrary(one.token);

    const two = await registerUser({ username: "destino", email: "destino@example.com" });
    const exported = await request(app).get("/export").set(authHeader(one.token));
    const res = await request(app)
      .post("/import/readtrack")
      .set(authHeader(two.token))
      .send({ plan: exported.body });

    expect(res.status).toBe(200);
    // los libros son globales: la segunda cuenta reutiliza los ya importados
    expect(res.body.booksCreated).toBe(0);
    expect(res.body.booksMerged).toBe(2);

    const theirs = await request(app).get("/export").set(authHeader(two.token));
    expect(theirs.body.books).toHaveLength(2);
    expect(theirs.body.notes).toHaveLength(2);
    expect(theirs.body.books.find((b) => b.title === "El quijote").sessionDays).toHaveLength(1);
    expect(theirs.body.books.find((b) => b.title === "Libro archivado").isArchived).toBe(true);
    expect(theirs.body.goals).toContainEqual({ type: "annual", metric: "books", value: 12, year: 2026 });
  });
});

describe("GET /export/csv", () => {
  test("exige autenticación", async () => {
    const res = await request(app).get("/export/csv");
    expect(res.status).toBe(401);
  });

  test("devuelve el encabezado para un usuario sin libros", async () => {
    const { token } = await registerUser();
    const res = await request(app).get("/export/csv").set(authHeader(token));
    expect(res.status).toBe(200);
    const header = res.body.csv.split("\n");
    expect(header[0]).toContain("Exclusive Shelf");
    expect(header).toHaveLength(1);
  });

  test("mapea estados a estantes de Goodreads y escapa comas y comillas", async () => {
    const { token } = await registerUser();
    await request(app)
      .post("/import/readtrack")
      .set(authHeader(token))
      .send({
        plan: {
          books: [
            {
              bid: "u1",
              title: "Doc, el libro",
              author: "Autor, Hijo",
              pages: 300,
              status: "completed",
              currentPage: 300,
              rating: 4,
              startedAt: "2026-01-01",
              finishedAt: "2026-03-15",
              review: 'Bueno, "muy bueno".',
              readingMode: "page",
              isArchived: false,
              createdAtMs: null,
              categories: [],
              cycles: [],
              sessionDays: [],
            },
            {
              bid: "u2",
              title: "En cola",
              author: "Autor Dos",
              pages: 100,
              status: "wishlist",
              currentPage: 0,
              rating: null,
              startedAt: null,
              finishedAt: null,
              review: null,
              readingMode: "page",
              isArchived: false,
              createdAtMs: null,
              categories: [],
              cycles: [],
              sessionDays: [],
            },
          ],
          notes: [],
          goals: [],
        },
      });

    const res = await request(app).get("/export/csv").set(authHeader(token));
    expect(res.status).toBe(200);
    const lines = res.body.csv.split("\n");
    expect(lines[0]).toBe(
      "Book Id,Title,Author,ISBN,ISBN13,My Rating,Number of Pages,Year Published,Date Read,Exclusive Shelf,My Review"
    );
    expect(lines).toHaveLength(3);

    expect(lines[1]).toContain('"Doc, el libro"');
    expect(lines[1]).toContain('"Autor, Hijo"');
    expect(lines[1]).toContain("4");
    expect(lines[1]).toContain("300");
    expect(lines[1]).toContain("2026-03-15");
    expect(lines[1]).toContain(",read,");
    expect(lines[1]).toContain('"Bueno, ""muy bueno""."');

    expect(lines[2]).toContain("En cola");
    expect(lines[2]).toContain(",to-read,");
  });
});

describe("POST /import/readtrack", () => {
  test("rechaza respaldos sin lista de libros", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/import/readtrack")
      .set(authHeader(token))
      .send({ plan: { notas: [] } });
    expect(res.status).toBe(400);
  });

  test("exige autenticación", async () => {
    const res = await request(app).post("/import/readtrack").send({ plan: PLAN });
    expect(res.status).toBe(401);
  });
});