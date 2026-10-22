const { app, request, resetDb, closeDb, registerUser, authHeader } = require("./helpers");
const { sent, clearSent } = require("../src/utils/email");

beforeEach(async () => {
  await resetDb();
  clearSent();
});
afterAll(closeDb);

describe("POST /feedback", () => {
  test("envía la sugerencia del usuario autenticado por correo", async () => {
    const user = await registerUser();
    const res = await request(app)
      .post("/feedback")
      .set(authHeader(user.token))
      .send({ message: "Me gustaría poder ordenar mis libros por autor." });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: "Sugerencia enviada" });
    expect(sent.at(-1)).toMatchObject({
      to: "soporte@readtrack.online",
      feedback: "Me gustaría poder ordenar mis libros por autor.",
      userEmail: "test@example.com",
    });
  });

  test("rechaza solicitudes sin sesión", async () => {
    const res = await request(app).post("/feedback").send({ message: "Una sugerencia válida" });
    expect(res.status).toBe(401);
  });

  test("rechaza sugerencias vacías o demasiado largas", async () => {
    const user = await registerUser();
    clearSent();
    const empty = await request(app).post("/feedback").set(authHeader(user.token)).send({ message: "   " });
    const long = await request(app).post("/feedback").set(authHeader(user.token)).send({ message: "x".repeat(2001) });
    expect(empty.status).toBe(400);
    expect(long.status).toBe(400);
    expect(sent).toHaveLength(0);
  });
});
