import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

// Credenciales de sesión (token de acceso, refresh y perfil con email) fuera
// de AsyncStorage: el JWT vive en Keychain/Keystore vía expo-secure-store.
// El `userId` (numérico, no sensible) se guarda en AsyncStorage y sirve como
// clave estable de partición para caché/cola (`cache:<userId>:`, etc.): ya no
// se usa el propio token como parte de las claves.
//
// expo-secure-store no existe en web: en ese entorno (solo dev) se usa un shim
// sobre AsyncStorage para no romper `expo start --web`.

const IS_NATIVE = Platform.OS !== "web";

const TOKEN_KEY = "readtrack.token";
const REFRESH_KEY = "readtrack.refreshToken";
const USER_KEY = "readtrack.user";
const USER_ID_KEY = "userId";

const logError = (context, error) =>
  console.warn(`[secureStorage] ${context}:`, error);

export async function getAuthState() {
  try {
    if (IS_NATIVE) {
      const [token, refreshToken, userRaw] = await Promise.all([
        SecureStore.getItemAsync(TOKEN_KEY),
        SecureStore.getItemAsync(REFRESH_KEY),
        SecureStore.getItemAsync(USER_KEY),
      ]);
      if (!token && !refreshToken && !userRaw) return null;
      return { token, refreshToken, user: userRaw ? JSON.parse(userRaw) : null };
    }
    const [token, refreshToken, userRaw] = await AsyncStorage.multiGet([
      TOKEN_KEY,
      REFRESH_KEY,
      USER_KEY,
    ]);
    if (!token && !refreshToken && !userRaw) return null;
    return { token, refreshToken, user: userRaw ? JSON.parse(userRaw) : null };
  } catch (e) {
    // Keystore inaccesible al arrancar: tratar como sesión no restaurable
    // (el login de nuevo regenera las credenciales). Nunca degradar a AsyncStorage.
    logError("leer estado de auth", e);
    return null;
  }
}

export async function getAccessToken() {
  if (!IS_NATIVE) return AsyncStorage.getItem(TOKEN_KEY);
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (e) {
    logError("leer token", e);
    return null;
  }
}

export async function getRefreshToken() {
  if (!IS_NATIVE) return AsyncStorage.getItem(REFRESH_KEY);
  try {
    return await SecureStore.getItemAsync(REFRESH_KEY);
  } catch (e) {
    logError("leer refresh token", e);
    return null;
  }
}

export async function setAuthState({ user, token, refreshToken }) {
  if (IS_NATIVE) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user));
    return;
  }
  await AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [REFRESH_KEY, refreshToken],
    [USER_KEY, JSON.stringify(user)],
  ]);
}

// Tras renovar el access token se rotan ambos; el perfil no cambia.
export async function setTokenPair(token, refreshToken) {
  if (IS_NATIVE) {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(REFRESH_KEY, refreshToken);
    return;
  }
  await AsyncStorage.multiSet([
    [TOKEN_KEY, token],
    [REFRESH_KEY, refreshToken],
  ]);
}

export async function clearAuthState() {
  try {
    if (IS_NATIVE) {
      await Promise.all([
        SecureStore.deleteItemAsync(TOKEN_KEY),
        SecureStore.deleteItemAsync(REFRESH_KEY),
        SecureStore.deleteItemAsync(USER_KEY),
      ]);
      return;
    }
    await AsyncStorage.multiRemove([TOKEN_KEY, REFRESH_KEY, USER_KEY]);
  } catch (e) {
    logError("limpiar credenciales", e);
  }
}

// Identificador de usuario para particionar caché/cola (no sensible).
export const getUserId = () => AsyncStorage.getItem(USER_ID_KEY);
export const setUserId = (id) => AsyncStorage.setItem(USER_ID_KEY, String(id));
export const clearUserId = () => AsyncStorage.removeItem(USER_ID_KEY);