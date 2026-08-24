import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";

const KEY_SEEN_ID = "whats_new_seen_id";
const KEY_SEEN_AT = "whats_new_seen_at";
const KEY_POPUP_DONE = "whats_new_popup_done_id";
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Identificador de la actualización actual. En desarrollo (Expo Go) no existe,
// pero puede forzarse con EXPO_PUBLIC_DEV_WHATSNEW=1 para previsualizar.
function currentUpdateId() {
  if (Updates.updateId) return Updates.updateId;
  if (process.env.EXPO_PUBLIC_DEV_WHATSNEW === "1") return "dev-preview";
  return null;
}

// Registra la primera vez que se detecta la actualización; ese instante
// arranca la ventana de 7 días de la sección en Perfil.
async function ensureSeen(id) {
  const storedId = await AsyncStorage.getItem(KEY_SEEN_ID);
  if (storedId !== id) {
    await AsyncStorage.setItem(KEY_SEEN_ID, id);
    await AsyncStorage.setItem(KEY_SEEN_AT, String(Date.now()));
    return Date.now();
  }
  return Number((await AsyncStorage.getItem(KEY_SEEN_AT)) || 0);
}

// Ventana de 7 días de la sección Novedades en Perfil.
export async function isWhatsNewVisible() {
  try {
    const id = currentUpdateId();
    if (!id) return false;
    await ensureSeen(id);
    const seenAt = Number((await AsyncStorage.getItem(KEY_SEEN_AT)) || 0);
    return seenAt > 0 && Date.now() - seenAt < WEEK_MS;
  } catch {
    return false;
  }
}

// El popup de entrada aparece una sola vez por actualización.
export async function shouldShowWhatsNewPopup() {
  try {
    const id = currentUpdateId();
    if (!id) return false;
    const done = await AsyncStorage.getItem(KEY_POPUP_DONE);
    if (done === id) {
      await ensureSeen(id);
      return false;
    }
    await ensureSeen(id);
    await AsyncStorage.setItem(KEY_POPUP_DONE, id);
    return true;
  } catch {
    return false;
  }
}
