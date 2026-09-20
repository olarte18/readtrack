const httpError = require("./httpError");

const BUCKET = "covers";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const MAGIC = {
  jpeg: Buffer.from([0xff, 0xd8, 0xff]),
  png: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
};

const EXT = { jpeg: "jpg", png: "png", webp: "webp" };
const CONTENT_TYPE = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

function isConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

function storageUrl(bucket, name) {
  return `${process.env.SUPABASE_URL}/storage/v1/object/${bucket}/${name}`;
}

// Detecta el formato real por magic bytes, no por extensión ni Content-Type.
function detectImage(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;
  if (MAGIC.jpeg.equals(buffer.subarray(0, 3))) return "jpeg";
  if (MAGIC.png.equals(buffer.subarray(0, 4))) return "png";
  if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "webp";
  }
  return null;
}

// Sube la portada a Supabase Storage (REST directo, sin SDK: evita el cliente
// de realtime que exige WebSocket nativo) y devuelve la URL pública para
// books.cover. Nunca toca el disco del servidor: Render tiene filesystem efímero.
async function uploadCover(buffer, bookId) {
  if (!isConfigured()) throw httpError(503, "Servicio de portadas no configurado");
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw httpError(400, "Imagen no válida");
  if (buffer.length > MAX_IMAGE_BYTES) throw httpError(413, "La imagen supera 5 MB");

  const type = detectImage(buffer);
  if (!type) throw httpError(400, "Formato de imagen no válido: usa JPG, PNG o WebP");

  const name = `book-${bookId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${EXT[type]}`;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(storageUrl(BUCKET, name), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "x-upsert": "false",
      "content-type": CONTENT_TYPE[type],
      "cache-control": "max-age=31536000",
    },
    body: buffer,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[coverStorage] Supabase Storage ${res.status}: ${body.slice(0, 200)}`);
    throw httpError(502, "No se pudo guardar la portada");
  }

  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${name}`;
}

module.exports = { uploadCover, isConfigured, detectImage, BUCKET, MAX_IMAGE_BYTES };