// Detección automática del backend.
// - En desarrollo (Expo Go / expo start): `__DEV__` es true → usar la IP LAN
//   de la PC (teléfono y PC en la misma red WiFi; sin cable USB). La IP se toma
//   del host de Metro (Constants.expoConfig.hostUri): es la misma que el teléfono
//   ya usó para conectarse, así que sobrevive a cambios de IP sin editar nada.
// - En producción (OTA/APK): `__DEV__` es false → usar producción.
// Si se define EXPO_PUBLIC_API_URL explícitamente, esa gana sobre todo.
import Constants from "expo-constants";

const PROD_URL = "https://readtrack-b3sj.onrender.com";
const FALLBACK_DEV_HOST = "192.168.1.1";
const metroHost = Constants.expoConfig?.hostUri?.split(":")[0];
const DEV_URL = `http://${metroHost || FALLBACK_DEV_HOST}:3000`;

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? DEV_URL : PROD_URL);
