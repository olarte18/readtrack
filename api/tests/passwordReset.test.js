const { app, request, pool, resetDb, closeDb } = require("./helpers");
const { sent, clearSent } = require("../src/utils/email");

beforeEach(async () => {
  await resetDb();
  clearSent();
});
afterAll(closeDb);

async function makeUserWithResetCode(overrides = {}) {
  const res = await request(app).post("/auth/register").send({
    username: "juan",
    email: "juan@example.com",
    password: "password123",
    ...overrides,
  });
  expect(res.status).toBe(201);
  await request(app).post("/auth/forgot-password").send({ email: res.body.user.email });
  return { user: res.body.user, code: sent[sent.length - 1].code };
}

describe("POST /auth/forgot-password", () => {
  test("responde ok si el email no existe y no crea códigos", async () => {
    const res = await request(app).post("/auth/forgot-password").send({ email: "nadie@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM verification_codes");
    expect(rows[0].n).toBe(0);
    expect(sent).toHaveLength(0);
  });

  test("crea un código de 6 dígitos hasheado y lo envía al email", async () => {
    expect((await request(app).post("/auth/register").send({
      username: "juan",
      email: "juan@example.com",
      password: "password123",
    })).status).toBe(201);
    const res = await request(app).post("/auth/forgot-password").send({ email: "juan@example.com" });
    expect(res.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("juan@example.com");
    expect(sent[0].code).toMatch(/^\d{6}$/);

    const { rows } = await pool.query(
      "SELECT code, type, used, expires_at > NOW() AS vigente FROM verification_codes"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe("password_reset");
    expect(rows[0].used).toBe(false);
    expect(rows[0].vigente).toBe(true);
    expect(rows[0].code).not.toBe(sent[0].code); // hasheado, no texto plano
  });

  test("invalida códigos previos sin usar del mismo usuario", async () => {
    await request(app).post("/auth/register").send({
      username: "juan",
      email: "juan@example.com",
      password: "password123",
    });
    await request(app).post("/auth/forgot-password").send({ email: "juan@example.com" });
    await request(app).post("/auth/forgot-password").send({ email: "juan@example.com" });
    const { rows } = await pool.query("SELECT id, used FROM verification_codes ORDER BY id");
    expect(rows).toHaveLength(2);
    expect(rows[0].used).toBe(true);
    expect(rows[1].used).toBe(false);
  });

  test("valida el email", async () => {
    const res = await request(app).post("/auth/forgot-password").send({ email: "no-es-email" });
    expect(res.status).toBe(400);
    const empty = await request(app).post("/auth/forgot-password").send({});
    expect(empty.status).toBe(400);
  });
});

describe("POST /auth/verify-reset-code", () => {
  test("acepta el código correcto", async () => {
    const { code } = await makeUserWithResetCode();
    const res = await request(app).post("/auth/verify-reset-code").send({
      email: "juan@example.com",
      code,
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  test("rechaza un código incorrecto sin consumirlo", async () => {
    await makeUserWithResetCode();
    const wrong = sent[0].code === "123456" ? "654321" : "123456";
    const res = await request(app).post("/auth/verify-reset-code").send({
      email: "juan@example.com",
      code: wrong,
    });
    expect(res.status).toBe(400);
    const { rows } = await pool.query("SELECT used FROM verification_codes");
    expect(rows[0].used).toBe(false);
  });

  test("rechaza un código expirado", async () => {
    const { code } = await makeUserWithResetCode();
    await pool.query("UPDATE verification_codes SET expires_at = NOW() - INTERVAL '1 minute'");
    const res = await request(app).post("/auth/verify-reset-code").send({
      email: "juan@example.com",
      code,
    });
    expect(res.status).toBe(400);
  });

  test("rechaza un código de un email inexistente", async () => {
    const res = await request(app).post("/auth/verify-reset-code").send({
      email: "nadie@example.com",
      code: "123456",
    });
    expect(res.status).toBe(400);
  });

  test("rechaza códigos no numéricos", async () => {
    const res = await request(app).post("/auth/verify-reset-code").send({
      email: "juan@example.com",
      code: "abcdef",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /auth/reset-password", () => {
  test("cambia la contraseña, revoca sesiones y consume el código", async () => {
    const { code } = await makeUserWithResetCode();
    const login = await request(app).post("/auth/login").send({
      email: "juan@example.com",
      password: "password123",
    });
    expect(login.status).toBe(200);
    const refreshToken = login.body.refreshToken;

    const res = await request(app).post("/auth/reset-password").send({
      email: "juan@example.com",
      code,
      newPassword: "nueva123",
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    const oldLogin = await request(app).post("/auth/login").send({
      email: "juan@example.com",
      password: "password123",
    });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post("/auth/login").send({
      email: "juan@example.com",
      password: "nueva123",
    });
    expect(newLogin.status).toBe(200);

    const oldRefresh = await request(app).post("/auth/refresh").send({ refreshToken });
    expect(oldRefresh.status).toBe(401);

    const { rows } = await pool.query("SELECT used FROM verification_codes");
    expect(rows[0].used).toBe(true);
  });

  test("no reutiliza un código ya consumido", async () => {
    const { code } = await makeUserWithResetCode();
    await request(app).post("/auth/reset-password").send({
      email: "juan@example.com",
      code,
      newPassword: "nueva123",
    });
    const res = await request(app).post("/auth/reset-password").send({
      email: "juan@example.com",
      code,
      newPassword: "otra123",
    });
    expect(res.status).toBe(400);
  });

  test("rechaza un código incorrecto sin cambiar la contraseña", async () => {
    await makeUserWithResetCode();
    const res = await request(app).post("/auth/reset-password").send({
      email: "juan@example.com",
      code: "000000",
      newPassword: "nueva123",
    });
    expect(res.status).toBe(400);
    const login = await request(app).post("/auth/login").send({
      email: "juan@example.com",
      password: "password123",
    });
    expect(login.status).toBe(200);
  });

  test("rechaza una contraseña nueva corta", async () => {
    const { code } = await makeUserWithResetCode();
    const res = await request(app).post("/auth/reset-password").send({
      email: "juan@example.com",
      code,
      newPassword: "123",
    });
    expect(res.status).toBe(400);
  });
});