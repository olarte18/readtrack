const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
const BASE_URL = "https://www.googleapis.com/books/v1";

export const searchBooks = async (query) => {
  try {
    const res = await fetch(
      `${BASE_URL}/volumes?q=${encodeURIComponent(query)}&maxResults=15&orderBy=relevance&printType=books&key=${API_KEY}`
    );
    const data = await res.json();
    if (!data.items) return [];

    return data.items
      .filter((item) => !!item.id)
      .map((item) => {
        const info = item.volumeInfo;
        const cover = info.imageLinks?.thumbnail?.replace("http://", "https://") ?? null;
        const score =
          (cover ? 2 : 0) +
          (info.pageCount ? 1 : 0) +
          (info.description ? 1 : 0) +
          (info.publishedDate ? 1 : 0) +
          (info.industryIdentifiers?.length ? 1 : 0);
        return {
          id: item.id,
          title: info.title ?? "Sin título",
          author: info.authors?.[0] ?? "Autor desconocido",
          year: info.publishedDate?.split("-")[0] ?? null,
          pages: info.pageCount ?? null,
          cover,
          isbn: info.industryIdentifiers?.[0]?.identifier ?? null,
          description: info.description ?? null,
          score,
        };
      })
      .sort((a, b) => b.score - a.score);
  } catch (error) {
    console.error("Error buscando libros:", error);
    return [];
  }
};

export const searchByISBN = async (isbn) => {
  try {
    const res = await fetch(
      `${BASE_URL}/volumes?q=isbn:${isbn}&key=${API_KEY}`
    );
    const data = await res.json();
    if (!data.items) return null;
    const info = data.items[0].volumeInfo;
    const cover = info.imageLinks?.thumbnail?.replace("http://", "https://") ?? null;
    return {
      id: data.items[0].id,
      title: info.title ?? "Sin título",
      author: info.authors?.[0] ?? "Autor desconocido",
      year: info.publishedDate?.split("-")[0] ?? null,
      pages: info.pageCount ?? null,
      cover,
      isbn,
      description: info.description ?? null,
    };
  } catch (error) {
    console.error("Error buscando por ISBN:", error);
    return null;
  }
};
