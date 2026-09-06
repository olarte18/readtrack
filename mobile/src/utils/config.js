// Detección automática del backend.
// - En desarrollo (Expo Go / expo start): `__DEV__` es true → usar la IP LAN
//   de la PC (teléfono y PC en la misma red WiFi; sin cable USB).
// - En producción (OTA/APK): `__DEV__` es false → usar producción.
// Si se define EXPO_PUBLIC_API_URL explícitamente, esa gana sobre todo.
const PROD_URL = "https://readtrack-b3sj.onrender.com";
const DEV_URL = "http://192.168.1.20:3000";

export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? DEV_URL : PROD_URL);
