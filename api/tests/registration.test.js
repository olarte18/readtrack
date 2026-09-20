const { app, request, pool, resetDb, closeDb, requestRegistrationCode } = require("./helpers");
const { sent, clearSent } = require("../src/utils/email");

beforeEach(async () => {
  await resetDb();
  clearSent();
});
afterAll(closeDb);

describe("POST /auth/request-register-code", () => {
  test("envía un código de 6 dígitos a un email nuevo y lo guarda hasheado", async () => {
    const res = await request(app).post("/auth/request-register-code").send({ email: "nueva@example.com" });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("nueva@example.com");
    expect(sent[0].code).toMatch(/^\d{6}$/);

    const { rows } = await pool.query(
      "SELECT email, code, type, used, expires_at > NOW() AS vigente FROM verification_codes"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe("nueva@example.com");
    expect(rows[0].type).toBe("registration");
    expect(rows[0].used).toBe(false);
    expect(rows[0].vigente).toBe(true);
    expect(rows[0].code).not.toBe(sent[0].code); // hasheado, no texto plano
  });

  test("rechaza con 409 si el email ya tiene cuenta, sin crear código ni enviar", async () => {
    const code = await requestRegistrationCode("existente@example.com");
    await request(app).post("/auth/register").send({
      username: "juan",
      email: "existente@example.com",
      password: "password123",
      code,
    });
    clearSent();
    const res = await request(app).post("/auth/request-register-code").send({ email: "existente@example.com" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/ya está registrado/i);
    expect(sent).toHaveLength(0);
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM verification_codes");
    expect(rows[0].n).toBe(1); // solo el código consumido del registro anterior
  });

  test("invalida el código de registro anterior sin usar del mismo email", async () => {
    await request(app).post("/auth/request-register-code").send({ email: "nueva@example.com" });
    await request(app).post("/auth/request-register-code").send({ email: "nueva@example.com" });
    const { rows } = await pool.query("SELECT used FROM verification_codes WHERE email = 'nueva@example.com' ORDER BY id");
    expect(rows).toHaveLength(2);
    expect(rows[0].used).toBe(true);
    expect(rows[1].used).toBe(false);
  });

  test("valida el email", async () => {
    const res = await request(app).post("/auth/request-register-code").send({ email: "no-es-email" });
    expect(res.status).toBe(400);
    const empty = await request(app).post("/auth/request-register-code").send({});
    expect(empty.status).toBe(400);
  });
});

describe("POST /auth/register (con código)", () => {
  test("crea la cuenta solo con un código válido y consume el código", async () => {
    const code = await requestRegistrationCode("nueva@example.com");
    const res = await request(app).post("/auth/register").send({
      username: "juan",
      email: "nueva@example.com",
      password: "password123",
      code,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.verified).toBe(true);
    expect(res.body.token).toBeDefined();
    const { rows } = await pool.query("SELECT used FROM verification_codes");
    expect(rows[0].used).toBe(true);
  });

  test("no crea cuenta sin código", async () => {
    const res = await request(app).post("/auth/register").send({
      username: "juan",
      email: "nueva@example.com",
      password: "password123",
    });
    expect(res.status).toBe(400);
    const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM users");
    expect(rows[0].n).toBe(0);
  });

  test("rechaza un código incorrecto y cuenta el intento", async () => {
    await requestRegistrationCode("nueva@example.com");
    const wrong = sent[0].code === "123456" ? "654321" : "123456";
    const res = await request(app).post("/auth/register").send({
      username: "juan",
      email: "nueva@example.com",
      password: "password123",
      code: wrong,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Código inválido o expirado");
    const { rows } = await pool.query("SELECT attempts FROM verification_codes");
    expect(rows[0].attempts).toBe(1);
    const users = await pool.query("SELECT COUNT(*)::int AS n FROM users");
    expect(users.rows[0].n).toBe(0);
  });

  test("bloquea el código tras 5 intentos fallidos", async () => {
    const code = await requestRegistrationCode("nueva@example.com");
    for (let i = 0; i < 5; i++) {
      const wrong = code === "123456" ? "654321" : "123456";
      const res = await request(app).post("/auth/register").send({
        username: "juan",
        email: "nueva@example.com",
        password: "password123",
        code: wrong,
      });
      expect(res.status).toBe(400);
    }
    const res = await request(app).post("/auth/register").send({
      username: "juan",
      email: "nueva@example.com",
      password: "password123",
      code,
    });
    expect(res.status).toBe(400);
    const { rows } = await pool.query("SELECT attempts FROM verification_codes");
    expect(rows[0].attempts).toBe(5);
  });

  test("rechaza un código expirado", async () => {
    const code = await requestRegistrationCode("nueva@example.com");
    await pool.query("UPDATE verification_codes SET expires_at = NOW() - INTERVAL '1 minute'");
    const res = await request(app).post("/auth/register").send({
      username: "juan",
      email: "nueva@example.com",
      password: "password123",
      code,
    });
    expect(res.status).toBe(400);
  });

  test("no reutiliza un código ya consumido", async () => {
    const code = await requestRegistrationCode("nueva@example.com");
    await request(app).post("/auth/register").send({
      username: "juan",
      email: "nueva@example.com",
      password: "password123",
      code,
    });
    const res = await request(app).post("/auth/register").send({
      username: "juan2",
      email: "otro@example.com",
      password: "password123",
      code,
    });
    expect(res.status).toBe(400);
  });

  test("un código no verifica un email distinto al solicitado", async () => {
    const code = await requestRegistrationCode("nueva@example.com");
    await request(app).post("/auth/request-register-code").send({ email: "otro@example.com" });
    const res = await request(app).post("/auth/register").send({
      username: "juan",
      email: "otro@example.com",
      password: "password123",
      code,
    });
    expect(res.status).toBe(400);
  });
});