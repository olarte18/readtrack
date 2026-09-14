const cache = require("../src/utils/cache");

const NOW = 1_700_000_000_000;
const MAX_SIZE = 500;

describe("caché en memoria con TTL y tope de 500 (FIFO)", () => {
  beforeAll(() => cache.setEnabled(true));
  afterAll(() => cache.setEnabled(false));

  beforeEach(() => {
    cache.clear();
    jest.spyOn(Date, "now").mockReturnValue(NOW);
  });
  afterEach(() => jest.restoreAllMocks());

  test("guardar y leer respetan el TTL", () => {
    cache.set("clave", "valor", 1000);
    expect(cache.get("clave")).toBe("valor");

    Date.now.mockReturnValue(NOW + 999);
    expect(cache.get("clave")).toBe("valor");

    Date.now.mockReturnValue(NOW + 1000);
    expect(cache.get("clave")).toBeUndefined();
  });

  test("desactivada por defecto en test: no guarda ni completa el tamaño", () => {
    cache.setEnabled(false);
    cache.set("clave", "valor", 60000);
    expect(cache.get("clave")).toBeUndefined();
    expect(cache.size()).toBe(0);
    cache.setEnabled(true);
  });

  test("clear vacía la caché", () => {
    cache.set("a", 1, 60000);
    cache.set("b", 2, 60000);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get("a")).toBeUndefined();
  });

  test("con 500 entradas vivas, la 501.ª evicta la más vieja (FIFO)", () => {
    for (let i = 0; i < MAX_SIZE; i++) cache.set("k" + i, i, 60000);
    expect(cache.size()).toBe(MAX_SIZE);

    cache.set("nueva", "v", 60000);
    expect(cache.size()).toBe(MAX_SIZE);
    expect(cache.get("k0")).toBeUndefined();
    expect(cache.get("k1")).toBe(1);
    expect(cache.get("nueva")).toBe("v");
  });

  test("al llenar con vencidos, set los limpia antes de evictar vivas", () => {
    for (let i = 0; i < 400; i++) cache.set("v" + i, i, 60000);
    for (let i = 0; i < 100; i++) cache.set("e" + i, i, 10);
    expect(cache.size()).toBe(MAX_SIZE);

    Date.now.mockReturnValue(NOW + 5000);
    cache.set("nueva", "x", 60000);

    expect(cache.get("v0")).toBe(0);
    expect(cache.get("nueva")).toBe("x");
    expect(cache.size()).toBe(401);
  });

  test("delPrefix borra por prefijo y el cache lleno sigue insertando", () => {
    for (let i = 0; i < 250; i++) cache.set("goals:" + i, i, 60000);
    for (let i = 0; i < 250; i++) cache.set("books:search:" + i, i, 60000);
    expect(cache.size()).toBe(MAX_SIZE);

    cache.delPrefix("goals:");
    expect(cache.size()).toBe(250);
    expect(cache.get("goals:0")).toBeUndefined();
    expect(cache.get("books:search:0")).toBe(0);

    cache.set("nueva", 1, 60000);
    expect(cache.size()).toBe(251);
    expect(cache.get("nueva")).toBe(1);
  });
});