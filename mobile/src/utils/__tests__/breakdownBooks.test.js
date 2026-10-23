import { filterCompletedBooksForBreakdown } from "../breakdownBooks";

const library = [
  {
    id: 1,
    db_id: 100,
    status: "completed",
    title: "Fantasía con categorías",
    genre: "Ficción",
    author: "Autora Uno",
    publisher: "Editorial A",
    categories: [{ name: "Fantasía" }, { name: "Aventura" }],
  },
  {
    id: 2,
    db_id: 101,
    status: "completed",
    title: "Género de respaldo",
    genre: "Fantasía",
    author: "Autora Uno",
    publisher: "Editorial B",
    categories: [],
  },
  {
    id: 3,
    db_id: 102,
    status: "reading",
    title: "Todavía en lectura",
    genre: "Fantasía",
    author: "Autora Uno",
    publisher: "Editorial A",
    categories: null,
  },
  {
    id: 4,
    db_id: 100,
    status: "completed",
    title: "Copia duplicada",
    genre: "Fantasía",
    author: "Autora Uno",
    publisher: "Editorial A",
    categories: [{ name: "Fantasía" }],
  },
  {
    id: 5,
    db_id: 103,
    status: "completed",
    is_archived: true,
    title: "Lectura archivada",
    genre: "Fantasía",
    author: "Autora Uno",
    publisher: "Editorial A",
    categories: [],
  },
];

describe("filterCompletedBooksForBreakdown", () => {
  test("filtra géneros por categorías y usa books.genre como respaldo", () => {
    const books = filterCompletedBooksForBreakdown(library, { kind: "genre", name: "Fantasía" });

    expect(books.map((book) => book.title)).toEqual([
      "Fantasía con categorías",
      "Género de respaldo",
    ]);
  });

  test("no usa el género de respaldo si existen categorías con nombre", () => {
    const books = filterCompletedBooksForBreakdown(library, { kind: "genre", name: "Ficción" });

    expect(books).toEqual([]);
  });

  test("filtra autores y editoriales, excluye no completados/archivados y deduplica libros", () => {
    const authors = filterCompletedBooksForBreakdown(library, { kind: "author", name: "Autora Uno" });
    const publishers = filterCompletedBooksForBreakdown(library, { kind: "publisher", name: "Editorial A" });

    expect(authors.map((book) => book.title)).toEqual(["Fantasía con categorías", "Género de respaldo"]);
    expect(publishers.map((book) => book.title)).toEqual(["Fantasía con categorías"]);
  });
});
