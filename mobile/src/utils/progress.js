const MODES = { page: "página", percentage: "porcentaje", chapter: "capítulo" };

export function modeLabel(book) {
  return MODES[book?.reading_mode ?? "page"];
}

export function modeUnit(book) {
  return { page: "págs", percentage: "%", chapter: "cap." }[book?.reading_mode ?? "page"];
}

export function formatPoint(book, value) {
  const mode = book?.reading_mode ?? "page";
  const v = value ?? book?.current_page ?? 0;
  if (mode === "percentage") return `${v}%`;
  if (mode === "chapter") return `Capítulo ${v}`;
  return `Página ${v}`;
}

export function deltaLabel(book, delta) {
  const mode = book?.reading_mode ?? "page";
  const n = Math.max(0, Number(delta) || 0);
  if (mode === "percentage") return `${n}%`;
  if (mode === "chapter") return `${n} ${n === 1 ? "capítulo" : "capítulos"}`;
  return `${n} ${n === 1 ? "página" : "páginas"}`;
}

export function completionBound(book) {
  const mode = book?.reading_mode ?? "page";
  if (mode === "percentage") return 100;
  if (mode === "chapter") return book?.chapters ?? null;
  return book?.pages ?? null;
}

export function isCompleted(book, value) {
  const bound = completionBound(book);
  return bound != null && Number(value || 0) >= bound;
}

export function progressFraction(book, value) {
  const bound = completionBound(book);
  const v = value ?? book?.current_page ?? 0;
  if (bound == null) return null;
  return Math.min(Number(v || 0) / bound, 1);
}

export function pagesEquivalent(book, end, start = 0) {
  const mode = book?.reading_mode ?? "page";
  const delta = Math.max(0, Number(end || 0) - Number(start || 0));
  if (mode === "page") return delta;
  if (!book?.pages) return 0;
  if (mode === "percentage") return Math.round((delta / 100) * book.pages);
  if (mode === "chapter") return book.chapters ? Math.round((delta / book.chapters) * book.pages) : 0;
  return 0;
}

export function pagesLeftEquivalent(book, value) {
  if (!book?.pages) return null;
  const fraction = progressFraction(book, value);
  if (fraction == null) return null;
  return Math.max(0, Math.round((1 - fraction) * book.pages));
}