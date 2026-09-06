// Devuelve una versión de la portada con mayor resolución para usos de fondo
// (pantalla completa). Las URLs guardadas en BD son miniaturas de baja
// resolución; estas reglas las convierten a la variante grande sin tocar la BD.
export function getHiResCover(url) {
  if (!url) return url;
  // Google Books: subir el zoom de la miniatura (zoom=1 -> zoom=2, img=1 -> img=2)
  if (url.includes("books.google.com/books/content")) {
    return url.replace(/zoom=1/, "zoom=2").replace(/&img=1/, "&img=2");
  }
  // Open Library: tamaño mediano (-M) a grande (-L)
  if (url.includes("covers.openlibrary.org")) {
    return url.replace(/-M\.jpg$/i, "-L.jpg");
  }
  return url; // formato no reconocido: se deja igual
}
