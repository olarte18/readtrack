// Caché en memoria con TTL y tope de 500 entradas. Una sola instancia de API => Map
// es suficiente. Al estar llena y no haber vencidos, se evicta por orden de inserción
// (FIFO, no LRU): el Map preserva el orden de inserción, así que no hace falta
// registrar accesos ni tener una librería extra.
// Por defecto queda desactivada en NODE_ENV=test para no interferir con los tests;
// setEnabled() permite activarla en un test concreto.
const store = new Map();

const MAX_SIZE = 500;

let enabled = process.env.NODE_ENV !== "test";

function setEnabled(value) {
  enabled = Boolean(value);
}

function evictExpired() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expires <= now) store.delete(key);
  }
}

function evictOldest() {
  const oldestKey = store.keys().next().value;
  if (oldestKey !== undefined) store.delete(oldestKey);
}

function set(key, value, ttlMs) {
  if (!enabled) return;
  if (store.size >= MAX_SIZE) {
    evictExpired();
    while (store.size >= MAX_SIZE) evictOldest();
  }
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

function clear() {
  store.clear();
}

function size() {
  return store.size;
}

module.exports = { set, get, delPrefix, setEnabled, clear, size };
