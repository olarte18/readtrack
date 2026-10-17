import AsyncStorage from "@react-native-async-storage/async-storage";
import { isNetworkError } from "./api";
import { getUserId } from "./secureStorage";

const MAX_ATTEMPTS = 5;
const MAX_FAILED = 100;

const queueKey = async () => {
  const userId = await getUserId();
  return userId ? `offline:${userId}` : null;
};

// Zona muerta (dead-letter): items que agotaron los intentos. Se conservan para
// poder reintentarlos y avisar al usuario, en vez de borrarlos en silencio.
const failedKey = async () => {
  const userId = await getUserId();
  return userId ? `offline-failed:${userId}` : null;
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

// Conserva la clave de idempotencia creada por el intento online si la sesión
// pasa a la cola tras agotarse la ventana de espera.
export async function enqueueSession(clientId, payload) {
  if (!clientId) throw new Error("clientId es obligatorio para encolar una sesión");
  return enqueue({ type: "save-session", clientId, payload });
}

async function removeItem(id) {
  const key = await queueKey();
  if (!key) return;
  const queue = await getPending();
  await AsyncStorage.setItem(key, JSON.stringify(queue.filter((i) => i.id !== id)));
}

// Items que no se pudieron subir tras agotar los intentos. Se guardan aparte
// (fuera de la FIFO) para no bloquear la cola y poder reintentarlos/descartarlos.
export async function getFailed() {
  const key = await failedKey();
  if (!key) return [];
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// Mueve un item de la cola a la zona muerta, conservando su client_id (así el
// reintento sigue siendo idempotente). Acota el tamaño descartando el más viejo.
async function moveToFailed(item) {
  const key = await failedKey();
  if (!key) return;
  const failed = await getFailed();
  failed.push({ ...item, failedAt: Date.now() });
  const trimmed = failed.slice(-MAX_FAILED);
  await AsyncStorage.setItem(key, JSON.stringify(trimmed));
}

export async function discardFailed() {
  const key = await failedKey();
  if (!key) return;
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // best-effort
  }
}

// Devuelve los items fallidos a la cola con intentos en cero para un reintento.
export async function requeueFailed() {
  const key = await failedKey();
  const qKey = await queueKey();
  if (!key || !qKey) return 0;
  const failed = await getFailed();
  if (failed.length === 0) return 0;
  const queue = await getPending();
  const seen = new Set(queue.map((i) => i.id));
  const requeued = failed
    .filter((i) => !seen.has(i.id))
    .map((i) => ({
      id: i.id,
      clientId: i.clientId,
      attempts: 0,
      queuedAt: i.queuedAt ?? Date.now(),
      payload: i.payload,
    }));
  await AsyncStorage.setItem(qKey, JSON.stringify([...queue, ...requeued]));
  await AsyncStorage.removeItem(key);
  return requeued.length;
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
// más tarde) y los 400/404/500 acumulan intentos: tras MAX_ATTEMPTS el item se
// mueve a la zona muerta (no se borra) para no bloquear la cola y avisar luego.
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
        await moveToFailed({ ...item, attempts }); // irrecuperable: a la zona muerta
        await removeItem(item.id);
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
    await AsyncStorage.multiRemove([`offline:${userId}`, `offline-failed:${userId}`]);
  } catch {
    // best-effort
  }
}
