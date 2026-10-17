// Traducción de títulos vía MyMemory (https://mymemory.translated.net), sin key.
// Solo se usa como respaldo en /books/discover cuando una obra NO tiene edición en
// español. Cachea por título normalizado 24 h para no golpear el límite diario del
// proveedor. Nunca lanza: si falla devuelve null y el cliente muestra el original.
const cache = require("./cache");

const PROVIDER_URL = "https://api.mymemory.translated.net/get";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Desactivada en tests (igual que cache.js) salvo setEnabled(true) explícito, y
// desactivable en producción con TRANSLATE_ENABLED=false (degradación al original).
let enabled = process.env.NODE_ENV !== "test" && process.env.TRANSLATE_ENABLED !== "false";

function setEnabled(value) {
  enabled = Boolean(value);
}

function normKey(text) {
  return String(text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function translateTitle(text, { from = "en", to = "es" } = {}) {
  const source = String(text ?? "").trim();
  if (!source || !enabled) return null;

  const key = `translate:${from}:${to}:${normKey(source)}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached; // null también se cachea

  try {
    const email = process.env.MYMEMORY_EMAIL
      ? `&de=${encodeURIComponent(process.env.MYMEMORY_EMAIL)}`
      : "";
    const langpair = encodeURIComponent(`${from}|${to}`);
    const res = await fetch(`${PROVIDER_URL}?q=${encodeURIComponent(source)}&langpair=${langpair}${email}`);
    if (!res.ok) return null;

    const data = await res.json();
    const translated = data?.responseData?.translatedText;
    if (typeof translated !== "string") return null;

    const clean = translated.trim();
    const upper = clean.toUpperCase();
    // MyMemory devuelve avisos de límite como texto plano con status 200.
    if (!clean || upper.includes("MYMEMORY WARNING") || upper.includes("QUERY LENGTH LIMIT")) return null;
    if (normKey(clean) === normKey(source)) return null; // sin traducción útil

    cache.set(key, clean, CACHE_TTL_MS);
    return clean;
  } catch {
    return null;
  }
}

module.exports = { translateTitle, setEnabled };
