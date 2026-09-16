const { app, request, pool, resetDb, closeDb, requestRegistrationCode } = require("./helpers");
const bcrypt = require("bcryptjs");

const registerPayload = (overrides = {}) => ({
  username: "juan",
  email: "juan@example.com",
  password: "password123",
  ...overrides,
});

async function registerWithCode(overrides = {}) {
  const payload = registerPayload(overrides);
  const code = await requestRegistrationCode(payload.email);
  return request(app).post("/auth/register").send({ ...payload, code });
}

// Siembre un código de registro válido para un email (útil cuando el email ya tiene
// cuenta: la vía normal por diseño no emite más códigos para emails existentes).
async function seedRegistrationCode(email) {
  const code = "123456";
  const hashed = await bcrypt.hash(code, 10);
  await pool.query(
    "INSERT INTO verification_codes (email, code, type, expires_at) VALUES ($1, $2, 'registration', NOW() + INTERVAL '15 minutes')",
    [email, hashed]
  );
  return code;
}

beforeEach(resetDb);
afterAll(closeDb);

describe("POST /auth/register", () => {
  test("registra un usuario y devuelve token", async () => {
    const res = await registerWithCode();
    expect(res.status).toBe(201);
    expect(res.body.user.username).toBe("juan");
    expect(res.body.user.email).toBe("juan@example.com");
    expect(res.body.token).toBeDefined();
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.user.verified).toBe(true);
  });

  test("rechaza email duplicado", async () => {
    await registerWithCode({ email: "dup@example.com" });
    const code = await seedRegistrationCode("dup@example.com");
    const res = await request(app).post("/auth/register").send({
      ...registerPayload({ email: "dup@example.com", username: "juan2" }),
      code,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("El email ya está registrado");
  });

  test("rechaza usuario duplicado", async () => {
    await registerWithCode();
    const code = await seedRegistrationCode("otro@example.com");
    const res = await request(app).post("/auth/register").send({
      ...registerPayload({ email: "otro@example.com" }),
      code,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("El usuario ya existe");
  });

  test("rechaza campos faltantes", async () => {
    const res = await request(app).post("/auth/register").send({ email: "x@x.com" });
    expect(res.status).toBe(400);
  });

  test("rechaza email inválido", async () => {
    const res = await request(app).post("/auth/register").send(registerPayload({ email: "no-es-email" }));
    expect(res.status).toBe(400);
  });

  test("rechaza contraseña corta", async () => {
    const res = await request(app).post("/auth/register").send(registerPayload({ password: "123" }));
    expect(res.status).toBe(400);
  });

  test("rechaza registro sin código", async () => {
    const res = await request(app).post("/auth/register").send(registerPayload());
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("code es requerido");
  });

  test("rechaza un código incorrecto", async () => {
    await requestRegistrationCode("juan@example.com");
    const res = await request(app).post("/auth/register").send({
      ...registerPayload(),
      code: "000000",
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Código inválido o expirado");
  });
});

describe("POST /auth/login", () => {
  beforeEach(async () => {
    await registerWithCode();
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
    await registerWithCode();
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