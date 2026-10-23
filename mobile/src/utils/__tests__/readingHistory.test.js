import {
  getLongestCompletedBooks,
  groupCompletedBooksByMonth,
  getUndatedCompletedBooks,
} from "../readingHistory";

const library = [
  { id: 1, db_id: 10, title: "Libro largo", pages: 700, status: "completed", finished_at: "2025-02-11", book_type: "physical" },
  { id: 2, db_id: 11, title: "Libro breve", pages: 120, status: "completed", finished_at: "2025-11-02", book_type: "ebook" },
  { id: 3, db_id: 12, title: "Audiolibro", pages: 420, status: "completed", finished_at: "2025-11-21", book_type: "audio" },
  { id: 4, db_id: 10, title: "Copia del libro largo", pages: 700, status: "completed", finished_at: "2025-02-11", book_type: "physical" },
  { id: 5, db_id: 13, title: "Lectura en curso", pages: 1200, status: "reading", finished_at: null },
  { id: 6, db_id: 14, title: "Terminado sin fecha", pages: 90, status: "completed", finished_at: null },
  { id: 7, db_id: 15, title: "Terminado otro año", pages: 950, status: "completed", finished_at: "2024-08-03" },
  { id: 8, db_id: 16, title: "Archivado", pages: 1500, status: "completed", is_archived: true, finished_at: "2025-06-20" },
];

describe("reading history statistics", () => {
  test("ranks completed books with known page counts for the selected year", () => {
    const books = getLongestCompletedBooks(library, 2025);

    expect(books.map((book) => book.title)).toEqual(["Libro largo", "Audiolibro", "Libro breve"]);
  });

  test("groups completed books by month, newest month first", () => {
    const months = groupCompletedBooksByMonth(library, 2025);

    expect(months.map((month) => month.key)).toEqual(["2025-11", "2025-02"]);
    expect(months[0].books.map((book) => book.title)).toEqual(["Audiolibro", "Libro breve"]);
  });

  test("returns completed books with no finish date separately", () => {
    expect(getUndatedCompletedBooks(library).map((book) => book.title)).toEqual(["Terminado sin fecha"]);
  });
});
