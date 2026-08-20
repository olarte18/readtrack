const OL_BASE = "https://openlibrary.org";

const coverUrl = (coverId, size = "M") =>
  coverId ? `https://covers.openlibrary.org/b/id/${coverId}-${size}.jpg` : null;

const mapDoc = (d) => {
  const workKey = d.key ?? null;
  const isbn = d.isbn?.[0] ?? null;
  const id = workKey ? workKey.replace("/works/", "") : (isbn || `ol-${d.title}-${d.author_name?.[0] ?? ""}`).replace(/[^a-zA-Z0-9-]/g, "-");
  return {
    id,
    workKey,
    title: d.title ?? "Sin título",
    author: d.author_name?.[0] ?? "Autor desconocido",
    year: d.first_publish_year ?? null,
    pages: parseInt(String(d.number_of_pages_median ?? ""), 10) || null,
    cover: coverUrl(d.cover_i),
    isbn,
    description: null,
  };
};

export const searchBooks = async (query) => {
  try {
    const res = await fetch(
      `${OL_BASE}/search.json?q=${encodeURIComponent(query)}&limit=20&fields=key,title,author_name,first_publish_year,number_of_pages_median,cover_i,isbn`
    );
    const data = await res.json();
    if (!data.docs) return [];
    return data.docs.filter((d) => d.title).map(mapDoc);
  } catch (error) {
    console.error("Error buscando libros:", error);
    return [];
  }
};

export const searchByISBN = async (isbn) => {
  try {
    const res = await fetch(
      `${OL_BASE}/search.json?q=isbn:${encodeURIComponent(isbn)}&limit=1&fields=key,title,author_name,first_publish_year,number_of_pages_median,cover_i,isbn`
    );
    const data = await res.json();
    const doc = data.docs?.[0];
    if (!doc) return null;
    return { ...mapDoc(doc), isbn };
  } catch (error) {
    console.error("Error buscando por ISBN:", error);
    return null;
  }
};

export const getBookDescription = async (workKey) => {
  if (!workKey) return null;
  try {
    const res = await fetch(`${OL_BASE}${workKey}.json`);
    const data = await res.json();
    const desc = data?.description;
    if (!desc) return null;
    return typeof desc === "string" ? desc : desc?.value ?? null;
  } catch (error) {
    console.error("Error obteniendo descripción:", error);
    return null;
  }
};