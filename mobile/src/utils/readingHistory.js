const finishedDate = (book) => {
  const value = book?.finished_at;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const date = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : "";
};

function completedBooks(library) {
  if (!Array.isArray(library)) return [];
  const seen = new Set();
  return library.filter((book) => {
    if (book.status !== "completed" || book.is_archived) return false;
    const id = book.db_id ?? book.id;
    if (id == null || seen.has(String(id))) return false;
    seen.add(String(id));
    return true;
  });
}

export function getLongestCompletedBooks(library, year, limit = 5) {
  const selectedYear = String(year);
  return completedBooks(library)
    .filter((book) => {
      const pages = Number(book.pages);
      return Number.isFinite(pages) && pages > 0 && finishedDate(book).slice(0, 4) === selectedYear;
    })
    .sort((a, b) => Number(b.pages) - Number(a.pages) || String(a.title).localeCompare(String(b.title), "es"))
    .slice(0, limit);
}

export function groupCompletedBooksByMonth(library, year) {
  const selectedYear = String(year);
  const grouped = new Map();
  for (const book of completedBooks(library)) {
    const date = finishedDate(book);
    if (!date || date.slice(0, 4) !== selectedYear) continue;
    const key = date.slice(0, 7);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(book);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, books]) => ({
      key,
      books: books.sort((a, b) => finishedDate(b).localeCompare(finishedDate(a)) || String(a.title).localeCompare(String(b.title), "es")),
    }));
}

export function getUndatedCompletedBooks(library) {
  return completedBooks(library).filter((book) => !finishedDate(book));
}
