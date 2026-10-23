const clean = (value) => String(value ?? "").trim();

function matchesGenre(book, name) {
  const categories = Array.isArray(book.categories)
    ? book.categories.map((category) => clean(category?.name)).filter(Boolean)
    : [];
  return categories.length ? categories.includes(name) : clean(book.genre) === name;
}

export function filterCompletedBooksForBreakdown(library, { kind, name }) {
  const selectedName = clean(name);
  if (!Array.isArray(library) || !selectedName) return [];

  const seen = new Set();
  return library.filter((book) => {
    if (book.status !== "completed" || book.is_archived) return false;

    const matches = kind === "genre"
      ? matchesGenre(book, selectedName)
      : kind === "author"
        ? clean(book.author) === selectedName
        : kind === "publisher"
          ? clean(book.publisher) === selectedName
          : false;
    if (!matches) return false;

    const uniqueId = book.db_id ?? book.id;
    if (uniqueId == null || seen.has(String(uniqueId))) return false;
    seen.add(String(uniqueId));
    return true;
  });
}
