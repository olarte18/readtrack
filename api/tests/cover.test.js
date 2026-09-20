const {
  app, request, resetDb, closeDb, registerUser, authHeader,
} = require("./helpers");
const httpError = require("../src/utils/httpError");

jest.mock("../src/utils/coverStorage", () => ({
  uploadCover: jest.fn(),
  isConfigured: jest.fn(() => true),
}));
const { uploadCover, isConfigured } = require("../src/utils/coverStorage");

const PUBLIC_URL =
  "https://xxxx.supabase.co/storage/v1/object/public/covers/book-1-1700000000000-abc.jpg";

// Un PNG real de 1x1px en base64 (la validación de magic bytes está mockeada).
const PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const DATA_URL = `data:image/png;base64,${PNG_BASE64}`;

beforeEach(() => {
  resetDb();
  jest.clearAllMocks();
  isConfigured.mockReturnValue(true);
  uploadCover.mockResolvedValue(PUBLIC_URL);
});
afterAll(closeDb);

async function addBook(token, overrides = {}) {
  const res = await request(app)
    .post("/user-books")
    .set(authHeader(token))
    .send({ title: "Cuento portada", author: "Yo", pages: 120, ...overrides });
  expect(res.status).toBe(201);
  const { pool } = require("./helpers");
  const { rows } = await pool.query("SELECT id FROM books WHERE id = $1", [res.body.book_id]);
  return rows[0]; // fila de books con su id real
}

describe("POST /books/:id/cover", () => {
  test("sube una portada y la guarda en books.cover sin tocar inventario", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);

    const res = await request(app)
      .post(`/books/${book.id}/cover`)
      .set(authHeader(token))
      .send({ image: PNG_BASE64 });

    expect(res.status).toBe(200);
    expect(res.body.cover).toBe(PUBLIC_URL);

    expect(uploadCover).toHaveBeenCalledTimes(1);
    const [buffer, bookId] = uploadCover.mock.calls[0];
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(String(bookId)).toBe(String(book.id));

    const got = await request(app).get(`/books/${book.id}`).set(authHeader(token));
    expect(got.body.cover).toBe(PUBLIC_URL);
  });

  test("acepta data URL (data:image/...;base64,)", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);

    const res = await request(app)
      .post(`/books/${book.id}/cover`)
      .set(authHeader(token))
      .send({ image: DATA_URL });

    expect(res.status).toBe(200);
    const [buffer] = uploadCover.mock.calls[0];
    expect(buffer.toString("base64")).toBe(PNG_BASE64);
  });

  test("requiere autenticación", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    const res = await request(app)
      .post(`/books/${book.id}/cover`)
      .send({ image: PNG_BASE64 });
    expect(res.status).toBe(401);
  });

  test("libro inexistente → 404", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/books/999999/cover")
      .set(authHeader(token))
      .send({ image: PNG_BASE64 });
    expect(res.status).toBe(404);
  });

  test("id no numérico → 404", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/books/no-num/cover")
      .set(authHeader(token))
      .send({ image: PNG_BASE64 });
    expect(res.status).toBe(404);
  });

  test("sin imagen → 400", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    const res = await request(app)
      .post(`/books/${book.id}/cover`)
      .set(authHeader(token))
      .send({});
    expect(res.status).toBe(400);
  });

  test("storage no configurado → 503 sin subir", async () => {
    isConfigured.mockReturnValue(false);
    const { token } = await registerUser();
    const book = await addBook(token);
    const res = await request(app)
      .post(`/books/${book.id}/cover`)
      .set(authHeader(token))
      .send({ image: PNG_BASE64 });
    expect(res.status).toBe(503);
    expect(uploadCover).not.toHaveBeenCalled();
  });

  test("error del storage se propaga (502)", async () => {
    uploadCover.mockRejectedValue(httpError(502, "No se pudo guardar la portada"));
    const { token } = await registerUser();
    const book = await addBook(token);
    const res = await request(app)
      .post(`/books/${book.id}/cover`)
      .set(authHeader(token))
      .send({ image: PNG_BASE64 });
    expect(res.status).toBe(502);
  });

  test("imagen inválida según storage se propaga (400)", async () => {
    uploadCover.mockRejectedValue(httpError(400, "Formato de imagen no válido: usa JPG, PNG o WebP"));
    const { token } = await registerUser();
    const book = await addBook(token);
    const res = await request(app)
      .post(`/books/${book.id}/cover`)
      .set(authHeader(token))
      .send({ image: PNG_BASE64 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no válido/i);
  });

  test("base64 demasiado grande → 413 antes de subir", async () => {
    const { token } = await registerUser();
    const book = await addBook(token);
    const res = await request(app)
      .post(`/books/${book.id}/cover`)
      .set(authHeader(token))
      .send({ image: "A".repeat(8 * 1024 * 1024 + 1) });
    expect(res.status).toBe(413);
    expect(uploadCover).not.toHaveBeenCalled();
  });
});