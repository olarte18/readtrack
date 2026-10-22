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

describe("GET /books/discover", () => {
  const translate = require("../src/utils/translate");

  // Mock de las dos consultas a Open Library (español y general) + MyMemory.
  function mockDiscover({ spaDocs = [], allDocs = [], translations = {} } = {}) {
    const fetchMock = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes("mymemory.translated.net")) {
        const q = decodeURIComponent((u.match(/[?&]q=([^&]*)/) || [])[1] || "");
        const translatedText = translations[q] ?? q;
        return { ok: true, json: async () => ({ responseData: { translatedText } }) };
      }
      if (u.includes("openlibrary.org")) {
        if (u.includes("language%3Aspa")) return { ok: true, json: async () => ({ docs: spaDocs }) };
        return { ok: true, json: async () => ({ docs: allDocs }) };
      }
      throw new Error("fetch inesperado: " + u);
    });
    global.fetch = fetchMock;
    return fetchMock;
  }

  afterEach(() => translate.setEnabled(false));

  test("prioriza ediciones en español con su título y portada reales", async () => {
    const { token } = await registerUser();
    mockDiscover({
      spaDocs: [
        {
          key: "/works/OL1W",
          title: "Alice's Adventures in Wonderland",
          edition_count: 10,
          author_name: ["Lewis Carroll"],
          editions: { docs: [{ title: "Alicia en el País de las Maravillas", language: ["spa"], cover_i: 111 }] },
        },
      ],
      allDocs: [
        { key: "/works/OL1W", title: "Alice's Adventures in Wonderland", edition_count: 10 }, // duplicado, se descarta
        { key: "/works/OL2W", title: "Some Very Popular Book", edition_count: 50 },
      ],
    });

    const res = await request(app).get("/books/discover?genre=fantasy").set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.body.books).toHaveLength(2);
    // La edición en español va primero aunque la otra tenga más ediciones.
    expect(res.body.books[0]).toMatchObject({
      id: "OL1W",
      title: "Alicia en el País de las Maravillas",
      display_title: "Alicia en el País de las Maravillas",
      translated: false,
      genre: "Fantasía",
      source: "openlibrary",
    });
    expect(res.body.books[0].cover).toContain("/111-M.jpg");
    // La obra sin edición en español queda después, con su título original.
    expect(res.body.books[1].title).toBe("Some Very Popular Book");
    expect(res.body.books[1].translated).toBe(false);
  });

  test("traduce el título cuando no hay edición en español", async () => {
    translate.setEnabled(true);
    const { token } = await registerUser();
    mockDiscover({
      spaDocs: [],
      allDocs: [{ key: "/works/OL9W", title: "The Name of the Wind", edition_count: 5 }],
      translations: { "The Name of the Wind": "El nombre del viento" },
    });

    const res = await request(app).get("/books/discover?genre=fantasy").set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.body.books[0]).toMatchObject({
      title: "The Name of the Wind", // original real: es lo que se guarda
      display_title: "El nombre del viento", // lo que se muestra
      original_title: "The Name of the Wind",
      translated: true,
    });
  });

  test("degrada al título original si la traducción falla", async () => {
    translate.setEnabled(true);
    const { token } = await registerUser();
    mockDiscover({
      spaDocs: [],
      allDocs: [{ key: "/works/OL9W", title: "Untranslatable Title", edition_count: 5 }],
      translations: { "Untranslatable Title": "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY" },
    });

    const res = await request(app).get("/books/discover?genre=fantasy").set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.body.books[0]).toMatchObject({
      title: "Untranslatable Title",
      display_title: "Untranslatable Title",
      translated: false,
    });
  });

  test("rechaza géneros que no estén permitidos", async () => {
    const { token } = await registerUser();
    const res = await request(app).get("/books/discover?genre=desconocido").set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(400);
  });
});

describe("GET /books/recommendations", () => {
  async function seedSignalBook({ title, genre = null, categories = [], googleId = null }) {
    const { rows: [book] } = await pool.query(
      `INSERT INTO books (google_id, title, author, genre) VALUES ($1, $2, $3, $4) RETURNING id`,
      [googleId, title, "Autora", genre]
    );
    for (let i = 0; i < categories.length; i += 1) {
      await pool.query(
        `INSERT INTO book_categories (book_id, name, is_primary, position) VALUES ($1, $2, $3, $4)`,
        [book.id, categories[i], i === 0, i]
      );
    }
    return book.id;
  }

  async function linkBook(userId, bookId, { status = "wishlist", rating = null, archived = false } = {}) {
    await pool.query(
      `INSERT INTO user_books (user_id, book_id, status, rating, is_archived) VALUES ($1, $2, $3, $4, $5)`,
      [userId, bookId, status, rating, archived]
    );
  }

  function mockCatalog(spaDocs = []) {
    const fetchMock = jest.fn(async (url) => {
      const u = String(url);
      if (u.includes("openlibrary.org")) {
        if (u.includes("language%3Aspa")) return { ok: true, json: async () => ({ docs: spaDocs }) };
        return { ok: true, json: async () => ({ docs: [] }) };
      }
      if (u.includes("mymemory.translated.net")) {
        return { ok: true, json: async () => ({ responseData: { translatedText: "traducido" } }) };
      }
      throw new Error("fetch inesperado: " + u);
    });
    global.fetch = fetchMock;
    return fetchMock;
  }

  test("se desactiva con menos de 3 libros con género identificable", async () => {
    const { user, token } = await registerUser();
    const fetchMock = mockCatalog();
    await linkBook(user.id, await seedSignalBook({ title: "Uno", categories: ["Fantasía"] }));
    await linkBook(user.id, await seedSignalBook({ title: "Dos", categories: ["Fantasía"] }));

    const res = await request(app).get("/books/recommendations").set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: false, signal_books: 2, books: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("activa recomendaciones, prioriza el género más frecuente y excluye libros ya guardados", async () => {
    const { user, token } = await registerUser();
    await linkBook(user.id, await seedSignalBook({ title: "Fantasía uno", categories: ["Fantasía"] }));
    await linkBook(user.id, await seedSignalBook({ title: "Fantasía dos", categories: ["Fantasía"], status: "completed", rating: 5 }));
    await linkBook(user.id, await seedSignalBook({ title: "Fantasía tres", categories: ["Fantasía"], googleId: "OL1W" }));
    await linkBook(user.id, await seedSignalBook({ title: "Misterio uno", categories: ["Misterio"] }));

    mockCatalog([
      { key: "/works/OL1W", title: "Ya en biblioteca", edition_count: 100, editions: { docs: [{ title: "Ya en biblioteca", language: ["spa"] }] } },
      { key: "/works/OL2W", title: "Recomendado", edition_count: 50, editions: { docs: [{ title: "Recomendado", language: ["spa"] }] } },
    ]);

    const res = await request(app).get("/books/recommendations").set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.signal_books).toBe(4);
    expect(res.body.genres[0]).toMatchObject({ key: "fantasy", label: "Fantasía", books: 3 });
    // OL1W ya está en la biblioteca; OL2W sí se recomienda.
    expect(res.body.books.map((b) => b.id)).toEqual(["OL2W"]);
    expect(res.body.books[0].reason).toBe("Porque te interesa Fantasía");
  });

  test("usa books.genre como respaldo y reconoce nombres en inglés", async () => {
    const { user, token } = await registerUser();
    await linkBook(user.id, await seedSignalBook({ title: "Uno", genre: "Science Fiction" }));
    await linkBook(user.id, await seedSignalBook({ title: "Dos", genre: "science-fiction" }));
    await linkBook(user.id, await seedSignalBook({ title: "Tres", genre: "Ciencia ficción" }));

    mockCatalog([
      { key: "/works/OL9W", title: "Dune", edition_count: 80, editions: { docs: [{ title: "Dune", language: ["spa"] }] } },
    ]);

    const res = await request(app).get("/books/recommendations").set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.genres[0]).toMatchObject({ key: "science_fiction", books: 3 });
  });

  test("ignora lecturas archivadas", async () => {
    const { user, token } = await registerUser();
    await linkBook(user.id, await seedSignalBook({ title: "Activo", categories: ["Fantasía"] }));
    await linkBook(user.id, await seedSignalBook({ title: "Archivado 1", categories: ["Fantasía"] }), { archived: true });
    await linkBook(user.id, await seedSignalBook({ title: "Archivado 2", categories: ["Fantasía"] }), { archived: true });

    mockCatalog();
    const res = await request(app).get("/books/recommendations").set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: false, signal_books: 1 });
  });

  test("no rompe si el catálogo falla", async () => {
    const { user, token } = await registerUser();
    await linkBook(user.id, await seedSignalBook({ title: "Uno", categories: ["Fantasía"] }));
    await linkBook(user.id, await seedSignalBook({ title: "Dos", categories: ["Fantasía"] }));
    await linkBook(user.id, await seedSignalBook({ title: "Tres", categories: ["Fantasía"] }));

    global.fetch = jest.fn(async () => ({ ok: false, json: async () => ({}) }));
    const res = await request(app).get("/books/recommendations").set({ Authorization: `Bearer ${token}` });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(res.body.books).toEqual([]);
    expect(res.body.catalog_error).toBe(true);
  });
});

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
