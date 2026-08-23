// Caché en memoria simple con TTL. Una sola instancia de API => Map es suficiente.
// En NODE_ENV=test queda desactivada para no interferir con los tests.
const store = new Map();

const enabled = process.env.NODE_ENV !== "test";

function evictExpired() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expires <= now) store.delete(key);
  }
}

function set(key, value, ttlMs) {
  if (!enabled) return;
  if (store.size >= 500) evictExpired();
  store.set(key, { value, expires: Date.now() + ttlMs });
}

function get(key) {
  if (!enabled) return undefined;
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expires <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function delPrefix(prefix) {
  if (!enabled) return;
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key);
  }
}

module.exports = { set, get, delPrefix };
