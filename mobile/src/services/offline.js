import AsyncStorage from "@react-native-async-storage/async-storage";
import { isNetworkError } from "./api";
import { getUserId } from "./secureStorage";

const MAX_ATTEMPTS = 5;

const queueKey = async () => {
  const userId = await getUserId();
  return userId ? `offline:${userId}` : null;
};

// UUID v4 sin dependencias (suficiente para idempotencia por sesión).
export const uuidv4 = () => {
  const hex = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${hex()}${hex()}-${hex()}-4${hex().slice(1)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex().slice(1)}-${hex()}${hex()}${hex()}`;
};

export async function getPending() {
  const key = await queueKey();
  if (!key) return [];
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Encola una operación de escritura (hoy: guardado de sesión con su update de
// progreso). La cola es FIFO por usuario; cada item lleva su propio client_id.
export async function enqueue(item) {
  const key = await queueKey();
  if (!key) return;
  const queue = await getPending();
  queue.push({
    id: uuidv4(),
    clientId: uuidv4(),
    attempts: 0,
    queuedAt: Date.now(),
    ...item,
  });
  await AsyncStorage.setItem(key, JSON.stringify(queue));
}

async function removeItem(id) {
  const key = await queueKey();
  if (!key) return;
  const queue = await getPending();
  await AsyncStorage.setItem(key, JSON.stringify(queue.filter((i) => i.id !== id)));
}

async function bumpAttempts(id, attempts) {
  const key = await queueKey();
  if (!key) return;
  const queue = await getPending();
  await AsyncStorage.setItem(
    key,
    JSON.stringify(queue.map((i) => (i.id === id ? { ...i, attempts } : i)))
  );
}

// Sube la cola en orden estricto (una sesión a la vez). submitFn(itemId, clientId, payload)
// debe lanzar ante cualquier fallo; la red caída detiene el flush (se reintenta
// más tarde) y los 400/404/500 marcan el item como fallado para no bloquear la cola.
export async function flushQueue(submitFn) {
  const queue = await getPending();
  if (queue.length === 0) return { synced: 0, remaining: 0, failed: 0 };

  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      await submitFn(item.id, item.clientId, item.payload);
      await removeItem(item.id);
      synced += 1;
    } catch (err) {
      if (isNetworkError(err)) break; // sin red: no insistir, quedan pendientes
      const attempts = (item.attempts ?? 0) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await removeItem(item.id); // item irrecuperable (libro borrado, etc.)
        failed += 1;
      } else {
        await bumpAttempts(item.id, attempts);
      }
    }
  }

  const remaining = (await getPending()).length;
  return { synced, remaining, failed };
}

// Migración única tras el cambio a claves por userId: re-clavea la cola que
// quedó partida bajo `offline:<token>` (instalaciones pre-SecureStore) hacia
// `offline:<userId>`, fusionando sin duplicar items. Best-effort.
export async function migrateLegacyQueue(oldToken, userId) {
  if (!oldToken || !userId) return;
  const legacyKey = `offline:${oldToken}`;
  const targetKey = `offline:${userId}`;
  try {
    const [rawLegacy, rawTarget] = await AsyncStorage.multiGet([legacyKey, targetKey]);
    const legacy = rawLegacy[1] ? JSON.parse(rawLegacy[1]) : [];
    if (legacy.length === 0) {
      if (rawLegacy[1] != null) await AsyncStorage.removeItem(legacyKey);
      return;
    }
    const target = rawTarget[1] ? JSON.parse(rawTarget[1]) : [];
    const seen = new Set(target.map((i) => i.id));
    const merged = [...target, ...legacy.filter((i) => !seen.has(i.id))];
    await AsyncStorage.setItem(targetKey, JSON.stringify(merged));
    await AsyncStorage.removeItem(legacyKey);
  } catch {
    // best-effort: la cola legacy queda donde estaba
  }
}

// Barrido de seguridad en cada arranque: una clave `offline:` cuyo sufijo
// contenga un punto es de la época en que la cola se claveaba con el JWT
// (`offline:<token>`; el userId es numérico y nunca lleva puntos). Se eliminan
// por si una migración falló y quedó una clave legacy filtrando el token.
export async function sweepLegacyOfflineKeys() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const stuck = keys.filter((k) => k.startsWith("offline:") && k.includes("."));
    if (stuck.length > 0) await AsyncStorage.multiRemove(stuck);
  } catch {
    // best-effort
  }
}

export async function clearPendingQueue(userId) {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(`offline:${userId}`);
  } catch {
    // best-effort
  }
}