const { app, request, resetDb, closeDb, registerUser, authHeader } = require("./helpers");

beforeEach(resetDb);
afterAll(closeDb);

const GOODREADS_CSV = [
  "Book Id,Title,Author,ISBN,ISBN13,My Rating,Number of Pages,Year Published,Date Read,Exclusive Shelf,My Review",
  '1,"El nombre del viento","Patrick Rothfuss","","9788401352836","5","700","2007","2010-05-01","read","Gran libro"',
  '2,"Cien años de soledad","Gabriel García Márquez","","","4","471","1967","","currently-reading",""',
].join("\n");

const BOOKMORY_CSV = [
  "Title,Authors,Status,Target pages,Read pages,Rating,Review,Started date,Finished date,ISBN,Género",
  '"La casa de las voces","Donato Carrisi","Leído","352","352","4","Muy bueno","2023-02-01","2023-02-10","9788466666529","Thriller"',
  '"El club de las 5 de la mañana","Robin Sharma","Quiero leer","336","0","","","","","","Autoayuda"',
].join("\n");

describe("POST /import/preview", () => {
  test("detecta el formato de Goodreads", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/import/preview")
      .set(authHeader(token))
      .send({ csv: GOODREADS_CSV });
    expect(res.status).toBe(200);
    expect(res.body.format).toBe("Goodreads");
    expect(res.body.total).toBe(2);
    expect(res.body.rows[0].title).toBe("El nombre del viento");
    expect(res.body.rows[0].pages).toBe(700);
  });

  test("detecta el formato de Bookmory", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/import/preview")
      .set(authHeader(token))
      .send({ csv: BOOKMORY_CSV });
    expect(res.status).toBe(200);
    expect(res.body.format).toBe("Bookmory");
    expect(res.body.rows[0].status).toBe("completed");
    expect(res.body.rows[1].status).toBe("wishlist");
  });

  test("rechaza CSV sin columna de título", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/import/preview")
      .set(authHeader(token))
      .send({ csv: "A,B,C\n1,2,3" });
    expect(res.status).toBe(400);
  });

  test("exige autenticación", async () => {
    const res = await request(app).post("/import/preview").send({ csv: GOODREADS_CSV });
    expect(res.status).toBe(401);
  });
});

describe("POST /import", () => {
  test("importa un CSV de Goodreads a la biblioteca", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/import")
      .set(authHeader(token))
      .send({ csv: GOODREADS_CSV });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);

    const library = await request(app).get("/user-books").set(authHeader(token));
    expect(library.body).toHaveLength(2);

    const [soledad, wind] = library.body.sort((a, b) => a.title.localeCompare(b.title));
    expect(wind.status).toBe("completed");
    expect(wind.rating).toBe(5);
    expect(soledad.status).toBe("reading");
  });

  test("no duplica libros al importar dos veces", async () => {
    const { token } = await registerUser();
    await request(app).post("/import").set(authHeader(token)).send({ csv: GOODREADS_CSV });
    const res = await request(app).post("/import").set(authHeader(token)).send({ csv: GOODREADS_CSV });

    expect(res.body.imported).toBe(0);
    expect(res.body.already).toBe(2);

    const library = await request(app).get("/user-books").set(authHeader(token));
    expect(library.body).toHaveLength(2);
  });

  test("importa Bookmory con páginas leídas y reseña", async () => {
    const { token } = await registerUser();
    const res = await request(app)
      .post("/import")
      .set(authHeader(token))
      .send({ csv: BOOKMORY_CSV });

    expect(res.status).toBe(200);
    expect(res.body.imported).toBe(2);

    const library = await request(app).get("/user-books").set(authHeader(token));
    const casa = library.body.find((b) => b.title === "La casa de las voces");
    expect(casa.status).toBe("completed");
    expect(casa.current_page).toBe(352);
    expect(casa.review).toContain("Muy bueno");
    expect(String(casa.finished_at).slice(0, 10)).toBe("2023-02-10");
    expect(casa.genre).toBe("Thriller");
  });
});