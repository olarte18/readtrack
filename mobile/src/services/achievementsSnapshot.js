import AsyncStorage from "@react-native-async-storage/async-storage";

// Snapshot de logros ya vistos/celebrados. La pantalla de Logros compara el
// estado del servidor contra este mapa para no volver a celebrar lo que ya se
// mostró al desbloquearse.
const SNAP_KEY = "ach:seen";

// Marca de "la pantalla de Logros ya se abrió alguna vez". Se usa para no
// celebrar en la primera apertura todo el inventario previo (que ahora puede
// incluir logros ya registrados por la celebración inmediata).
const INIT_KEY = "ach:initialized";

export const hasInitialized = async () => {
  try {
    return (await AsyncStorage.getItem(INIT_KEY)) != null;
  } catch {
    return false;
  }
};

export const markInitialized = async () => {
  try {
    await AsyncStorage.setItem(INIT_KEY, "1");
  } catch {
    // best-effort
  }
};

export const readSnapshot = async () => {
  try {
    const raw = await AsyncStorage.getItem(SNAP_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const saveSnapshot = async (map) => {
  try {
    await AsyncStorage.setItem(SNAP_KEY, JSON.stringify(map));
  } catch {
    // best-effort: no romper la celebración si falla el guardado
  }
};

// Registra los logros que se acaban de celebrar al instante.
export const recordCelebrated = async (items) => {
  if (!items || items.length === 0) return;
  const snap = (await readSnapshot()) ?? {};
  for (const i of items) snap[`${i.code}:${i.tier}`] = i.unlocked_at;
  await saveSnapshot(snap);
};
