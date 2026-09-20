const { app, request, pool, resetDb, closeDb, registerUser } = require("./helpers");
const cache = require("../src/utils/cache");

beforeEach(resetDb);
afterAll(closeDb);

async function seedBooks(rows) {
  const ids = [];
  for (const r of rows) {
    const { rows: [row] } = await pool.query(
      `INSERT INTO books (google_id, title, author, isbn) VALUES ($1, $2, $3, $4) RETURNING id`,
      [r.google_id ?? null, r.title, r.author ?? null, r.isbn ?? null]
    );
    ids.push(row.id);
  }
  return ids;
}

async function addToLibrary(userId, bookId) {
  await pool.query(
    `INSERT INTO user_books (user_id, book_id, status) VALUES ($1, $2, 'pending')`,
    [userId, bookId]
  );
}

function mockExternal({ googleItems = [], olDocs = [] } = {}) {
  const fetchMock = jest.fn(async (url) => {
    if (String(url).includes("googleapis.com")) {
      return {
        ok: true,
        text: async () => "",
        json: async () => ({
          items: googleItems.map((g, i) => ({
            id: g.id ?? `google${i}`,
            volumeInfo: {
              title: g.title,
              authors: g.author ? [g.author] : undefined,
              publishedDate: g.year ? String(g.year) : undefined,
              pageCount: g.pages,
              imageLinks: g.cover ? { thumbnail: g.cover } : undefined,
              industryIdentifiers: g.isbn ? [{ identifier: g.isbn }] : undefined,
              description: g.description,
              categories: g.genre ? [g.genre] : undefined,
            },
          })),
        }),
      };
    }
    if (String(url).includes("openlibrary.org")) {
      return {
        ok: true,
        text: async () => "",
        json: async () => ({ docs: olDocs }),
      };
    }
    throw new Error("fetch inesperado: " + url);
  });
  global.fetch = fetchMock;
  return fetchMock;
}

beforeAll(() => {
  // Por defecto las fuentes externas devuelven vacío en cada test.
  global.fetch = undefined;
});

const emptyExternal = { googleItems: [], olDocs: [] };

describe("GET /books/search", () => {
  test("rechaza búsqueda sin query", async () => {
    mockExternal(emptyExternal);
    const res = await request(app).get("/books/search");
    expect(res.status).toBe(400);
  });

  test("la BD tiene prioridad y ordena por popularidad (libros en bibliotecas primero)", async () => {
    const { user } = await registerUser();
    const [lucidez, ceguera] = await seedBooks([
      { google_id: "gb-lucidez", title: "Ensayo sobre la lucidez", author: "José Saramago" },
      { google_id: "gb-ceguera", title: "Ensayo sobre la ceguera", author: "José Saramago" },
    ]);
    await addToLibrary(user.id, ceguera); // ceguera es "popular" (está en una biblioteca)

    mockExternal(emptyExternal);
    const res = await request(app).get("/books/search").query({ q: "ensayo" });

    expect(res.status).toBe(200);
    expect(res.body.books).toHaveLength(2);
    expect(res.body.books[0].title).toBe("Ensayo sobre la ceguera");
    expect(res.body.books[0].source).toBe("db");
    expect(res.body.books[1].source).toBe("db");
    expect(res.body.books[0]).toHaveProperty("db_id", ceguera);
  });

  test("filtra resultados externos que no comparten ningún token", async () => {
    mockExternal({
      googleItems: [
        { id: "gb-lucidez", title: "Ensayo sobre la lucidez", author: "José Saramago" },
        { id: "gb-guia", title: "Guía para leer a José Saramago", author: "Ángel Basanta" },
        { id: "gb-morir", title: "Leer o morir", author: "Otra persona" },
      ],
      olDocs: [{ key: "/works/ruido1", title: "Reflexiones de un devorador de letras", author_name: ["Alguien"] }],
    });
    const res = await request(app).get("/books/search").query({ q: "ensayo sobre la lucidez" });

    expect(res.status).toBe(200);
    const titles = res.body.books.map((b) => b.title);
    expect(titles).toContain("Ensayo sobre la lucidez");
    expect(titles).not.toContain("Leer o morir");
    expect(titles).not.toContain("Reflexiones de un devorador de letras");
  });

  test("Open Library entra solo como relleno y ordenada por edition_count", async () => {
    mockExternal({
      googleItems: [
        { id: "gb-unamuno", title: "Biografía de Unamuno", author: "Historiador" },
      ],
      olDocs: [
        { key: "/works/cervantes", title: "Biografía de Cervantes", author_name: ["X"], edition_count: 10 },
        { key: "/works/borges", title: "Biografía de Borges", author_name: ["Y"], edition_count: 500 },
      ],
    });
    const res = await request(app).get("/books/search").query({ q: "biografia" });

    expect(res.status).toBe(200);
    const titles = res.body.books.map((b) => b.title);
    expect(titles[0]).toBe("Biografía de Unamuno");
    // Las más populares (más ediciones) del relleno van antes.
    expect(titles.indexOf("Biografía de Borges")).toBeLessThan(titles.indexOf("Biografía de Cervantes"));
  });

  test("Open Library se omite cuando la BD ya alcanza 3 coincidencias", async () => {
    await seedBooks([
      { google_id: "c1", title: "Héroes clásicos I", author: "Autora A" },
      { google_id: "c2", title: "Héroes clásicos II", author: "Autora A" },
      { google_id: "c3", title: "Héroes clásicos III", author: "Autora A" },
    ]);
    mockExternal({
      olDocs: [{ key: "/works/modernos", title: "Clásicos modernos", author_name: ["Z"], edition_count: 30 }],
    });
    const res = await request(app).get("/books/search").query({ q: "clasicos" });

    expect(res.status).toBe(200);
    const titles = res.body.books.map((b) => b.title);
    expect(titles).toHaveLength(3);
    expect(titles).not.toContain("Clásicos modernos");
    expect(res.body.books.every((b) => b.source === "db")).toBe(true);
  });

  test("deduplica: la versión de BD gana sobre un externo con el mismo google_id", async () => {
    await seedBooks([{ google_id: "dup1", title: "Cien años de soledad", author: "Gabriel García Márquez" }]);
    mockExternal({
      googleItems: [
        { id: "dup1", title: "Cien años de soledad", author: "Gabriel García Márquez" },
        { id: "dup2", title: "Cien años de soledad", author: "Gabriel García Márquez" },
      ],
    });
    const res = await request(app).get("/books/search").query({ q: "cien anos" });

    expect(res.status).toBe(200);
    expect(res.body.books).toHaveLength(1);
    expect(res.body.books[0].source).toBe("db");
  });

  test("ignora acentos y mayúsculas en la coincidencia de BD", async () => {
    await seedBooks([
      { google_id: "esc1", title: "Escultura italiana del quattrocento", author: "Historiador" },
      { google_id: "otro", title: "El golem y su creador", author: "Otro" },
    ]);
    mockExternal(emptyExternal);
    const res = await request(app).get("/books/search").query({ q: "ESCULTURA" });

    expect(res.status).toBe(200);
    expect(res.body.books).toHaveLength(1);
    expect(res.body.books[0].title).toBe("Escultura italiana del quattrocento");
  });

  test("encuentra por ISBN exacto aunque el título no contenga la query", async () => {
    await seedBooks([{ google_id: "isbn1", title: "El pergamino", author: "X", isbn: "9789876543210" }]);
    mockExternal(emptyExternal);
    const res = await request(app).get("/books/search").query({ q: "9789876543210" });

    expect(res.status).toBe(200);
    expect(res.body.books[0].title).toBe("El pergamino");
    expect(res.body.books[0].source).toBe("db");
  });

  test("guarda resultados no vacíos en caché", async () => {
    cache.setEnabled(true);
    cache.clear();
    const fetchMock = mockExternal({
      googleItems: [{ id: "cache1", title: "La ciudad y sus muros", author: "Calwino" }],
    });
    const q = "la ciudad y sus muros";

    const first = await request(app).get("/books/search").query({ q });
    expect(first.body.books).toHaveLength(1);
    const callsAfterFirst = fetchMock.mock.calls.length;

    const second = await request(app).get("/books/search").query({ q });
    expect(second.body.books).toEqual(first.body.books);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst); // no re-consulta fuentes

    cache.setEnabled(false);
    cache.clear();
  });
});