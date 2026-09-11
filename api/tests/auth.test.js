const { app, request, resetDb, closeDb } = require("./helpers");

beforeEach(resetDb);
afterAll(closeDb);

describe("POST /auth/register", () => {
  test("registra un usuario y devuelve token", async () => {
    const res = await request(app).post("/auth/register").send({
      username: "juan",
      email: "juan@example.com",
      password: "password123",
    });
    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe("juan");
    expect(res.body.user.email).toBe("juan@example.com");
    expect(res.body.token).toBeDefined();
    expect(res.body.user.password).toBeUndefined();
  });

  test("rechaza email duplicado", async () => {
    const payload = { username: "juan", email: "dup@example.com", password: "password123" };
    await request(app).post("/auth/register").send(payload);
    const res = await request(app).post("/auth/register").send({
      username: "juan2",
      email: "dup@example.com",
      password: "password123",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test("rechaza campos faltantes", async () => {
    const res = await request(app).post("/auth/register").send({ email: "x@x.com" });
    expect(res.status).toBe(400);
  });

  test("rechaza email inválido", async () => {
    const res = await request(app).post("/auth/register").send({
      username: "juan",
      email: "no-es-email",
      password: "password123",
    });
    expect(res.status).toBe(400);
  });

  test("rechaza contraseña corta", async () => {
    const res = await request(app).post("/auth/register").send({
      username: "juan",
      email: "juan@example.com",
      password: "123",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await request(app).post("/auth/register").send({
      username: "juan",
      email: "juan@example.com",
      password: "password123",
    });
  });

  test("loguea con credenciales válidas", async () => {
    const res = await request(app).post("/auth/login").send({
      email: "juan@example.com",
      password: "password123",
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  test("rechaza contraseña incorrecta", async () => {
    const res = await request(app).post("/auth/login").send({
      email: "juan@example.com",
      password: "incorrecta",
    });
    expect(res.status).toBe(401);
  });

  test("rechaza usuario inexistente", async () => {
    const res = await request(app).post("/auth/login").send({
      email: "nadie@example.com",
      password: "password123",
    });
    expect(res.status).toBe(401);
  });
});

describe("POST /auth/refresh", () => {
  beforeEach(async () => {
    await request(app).post("/auth/register").send({
      username: "juan",
      email: "juan@example.com",
      password: "password123",
    });
  });

  test("rota el refresh token y devuelve un access token nuevo", async () => {
    const login = await request(app).post("/auth/login").send({
      email: "juan@example.com",
      password: "password123",
    });
    const refreshToken = login.body.refreshToken;
    expect(refreshToken).toBeDefined();

    const res = await request(app).post("/auth/refresh").send({ refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.refreshToken).not.toBe(refreshToken);

    const old = await request(app).post("/auth/refresh").send({ refreshToken });
    expect(old.status).toBe(401);
  });

  test("rechaza un refresh token inválido", async () => {
    const res = await request(app).post("/auth/refresh").send({ refreshToken: "invalido" });
    expect(res.status).toBe(401);
  });

  test("rechaza un refresh token reutilizado (rotación)", async () => {
    const login = await request(app).post("/auth/login").send({
      email: "juan@example.com",
      password: "password123",
    });
    await request(app).post("/auth/refresh").send({ refreshToken: login.body.refreshToken });
    const reuse = await request(app).post("/auth/refresh").send({ refreshToken: login.body.refreshToken });
    expect(reuse.status).toBe(401);
  });

  test("logout revoca el refresh token", async () => {
    const login = await request(app).post("/auth/login").send({
      email: "juan@example.com",
      password: "password123",
    });
    await request(app).post("/auth/logout").send({ refreshToken: login.body.refreshToken });
    const res = await request(app).post("/auth/refresh").send({ refreshToken: login.body.refreshToken });
    expect(res.status).toBe(401);
  });
});

describe("Protección de rutas", () => {
  test("GET /user-books sin token devuelve 401", async () => {
    const res = await request(app).get("/user-books");
    expect(res.status).toBe(401);
  });

  test("GET /user-books con token inválido devuelve 401", async () => {
    const res = await request(app).get("/user-books").set("Authorization", "Bearer token-falso");
    expect(res.status).toBe(401);
  });
});