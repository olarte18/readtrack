const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_BOOKS_API_KEY;
const BASE_URL = "https://www.googleapis.com/books/v1";

export const searchBooks = async (query) => {
  try {
    const res = await fetch(
      `${BASE_URL}/volumes?q=${encodeURIComponent(query)}&maxResults=15&key=${API_KEY}`
    );
    const data = await res.json();

    if (!data.items) return [];

    return data.items.map((item) => {
      const info = item.volumeInfo;
      return {
        id: item.id,
        title: info.title ?? "Sin título",
        author: info.authors?.[0] ?? "Autor desconocido",
        year: info.publishedDate?.split("-")[0] ?? null,
        pages: info.pageCount ?? null,
        cover: info.imageLinks?.thumbnail?.replace("http://", "https://") ?? null,
        isbn: info.industryIdentifiers?.[0]?.identifier ?? null,
        description: info.description ?? null,
      };
    });
  } catch (error) {
    console.error("Error buscando libros:", error);
    return [];
  }
};
