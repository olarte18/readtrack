import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../utils/config";
import { markOnline, markOffline, getConnectivity } from "./connectivity";
import { emitAchievements } from "./achievementsBus";
import { recordCelebrated } from "./achievementsSnapshot";

const getHeaders = async () => {
  const token = await AsyncStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const DEFAULT_TIMEOUT = 10000;
const RETRY_DELAYS = [1500, 3000];

// Tras una caída de red marcamos offline; durante esta ventana las lecturas con
// caché se sirven al instante sin tocar la red (nada de gris). Pasada la ventana
// se vuelve a probar la red (pull-to-refresh, re-foco): si ya hay señal se vuelve
// a network-first, si sigue caída se re-marca offline.
const OFFLINE_RECHECK_MS = 8000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isNetworkError = (err) =>
  err && (err.name === "AbortError" || err.message === "Network request failed" || /Network request failed/.test(err.message || ""));

export { isNetworkError };

const cacheKey = (path) =>
  AsyncStorage.getItem("token").then((token) => (token ? `cache:${token}:${path}` : null));

const readCached = async (path) => {
  const key = await cacheKey(path);
  if (!key) return null;
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeCached = async (path, data) => {
  const key = await cacheKey(path);
  if (!key) return;
  try {
    await AsyncStorage.setItem(key, JSON.stringify(data));
  } catch {
    // la caché es best-effort: fallar en escribir no debe romper la llamada
  }
};

// GET con soporte offline: cuando hay señal se pide fresco (network-first con
// timeout corto y reintentos acotados) y la caché es el respaldo si la red cae
// a mitad de camino. Cuando sabemos que no hay señal (y no ha pasado mucho) se
// sirve la caché al instante sin tocar la red: nada de gris.
const isOfflineLocked = () => {
  const { online, lastFailure } = getConnectivity();
  return !online && lastFailure != null && Date.now() - lastFailure < OFFLINE_RECHECK_MS;
};

// Devuelve el dato cacheado (puede ser objeto o array) marcado como servido de
// caché SIN cambiar su tipo: esparcir un array lo degrada a objeto con claves
// numéricas y rompe .length/.filter en las pantallas.
const withFromCache = (data) => {
  if (Array.isArray(data)) {
    data.fromCache = true;
    return data;
  }
  return { ...data, fromCache: true };
};

const getWithCache = async (path, options = {}) => {
  const cached = await readCached(path);
  if (cached != null && isOfflineLocked()) {
    return withFromCache(cached);
  }
  // Revisión periódica de señal: si tenemos caché y sabemos que la red estaba
  // caída (ventana pasada), se prueba con un timeout corto y un solo intento
  // para no congelar la pantalla mientras se confirma si ya hay internet.
  // Lo mismo vale para el caso normal: una lectura cacheable no reintenta
  // (un fallo → caché al instante); los reintentos quedan para GETs sin caché.
  const probing = cached != null && !getConnectivity().online;
  const probeOptions = probing ? { timeout: 4000, retry: false } : { retry: false };
  try {
    const data = await request(path, { ...probeOptions, ...options });
    writeCached(path, data);
    return data;
  } catch (err) {
    if (isNetworkError(err)) {
      const fresh = cached ?? (await readCached(path));
      if (fresh != null) {
        markOffline();
        return withFromCache(fresh);
      }
    }
    throw err;
  }
};

let refreshingPromise = null;

const clearAuth = () =>
  AsyncStorage.multiRemove(["token", "refreshToken"]).catch(() => {});

const refreshAccessToken = async () => {
  if (!refreshingPromise) {
    refreshingPromise = (async () => {
      const refreshToken = await AsyncStorage.getItem("refreshToken");
      if (!refreshToken) throw new Error("Sin refresh token");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT);
      let res;
      try {
        res = await fetch(`${API_URL}/auth/refresh`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sesión expirada");
      await AsyncStorage.multiSet([
        ["token", data.token],
        ["refreshToken", data.refreshToken],
      ]);
      return data.token;
    })().catch(async (err) => {
      // Si el refresh falla por red, la sesión sigue en pie para operar offline
      // (la caché y la cola dependen de tener token). Solo se cierra la sesión
      // cuando el server rechaza el refresh (token realmente inválido/expirado).
      if (!isNetworkError(err)) await clearAuth();
      throw err;
    }).finally(() => {
      refreshingPromise = null;
    });
  }
  return refreshingPromise;
};

const request = async (path, options = {}) => {
  const { timeout = DEFAULT_TIMEOUT, retry, retries, ...fetchOptions } = options;
  const isGet = (fetchOptions.method || "GET") === "GET";
  const maxRetries = retry === false ? 0 : (retries ?? (isGet ? 2 : 0));
  let attempt = 0;
  let refreshTried = false;

  while (true) {
    // Sabemos que no hay señal recientemente: fallar al instante en lugar de
    // esperar el timeout. getWithCache sirve la caché; las escrituras caen al
    // catch del caller (p. ej. encolar la sesión) sin bloquear la pantalla.
    if (isOfflineLocked()) {
      throw new Error("Network request failed");
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(`${API_URL}${path}`, {
        headers: await getHeaders(),
        signal: controller.signal,
        ...fetchOptions,
      });
      clearTimeout(timer);
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        // Token expirado: intentar renovar una vez con el refresh token
        if (!refreshTried) {
          refreshTried = true;
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            attempt = 0;
            continue;
          }
        }
        await clearAuth();
        throw new Error(data.error || "Tu sesión expiró. Inicia sesión de nuevo.");
      }
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      markOnline();
      // Logros recién desbloqueados por esta acción: se celebran al instante y
      // se registran para que la pantalla de Logros no los repita.
      if (data && Array.isArray(data.new_achievements) && data.new_achievements.length > 0) {
        recordCelebrated(data.new_achievements);
        emitAchievements(data.new_achievements);
      }
      return data;
    } catch (err) {
      clearTimeout(timer);
      const retryable = isNetworkError(err);
      // Solo se reintenta si creíamos estar online (blip transitorio). Si ya
      // sabíamos que la red estaba caída, marcar offline y salir ya.
      if (retryable && !isOfflineLocked() && attempt < maxRetries) {
        attempt += 1;
        await sleep(RETRY_DELAYS[attempt - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]);
        continue;
      }
      if (retryable) markOffline(); // el indicador se prende ante el primer fallo
      throw err;
    }
  }
};

export const getLibrary = async () => {
  let data;
  try {
    data = await getWithCache("/user-books");
  } catch (err) {
    // Sin caché nueva (primera ejecución offline tras la actualización): usar la
    // clave legacy que ya poblaba la app anterior, así Leyendo no queda vacío.
    if (isNetworkError(err)) {
      const legacy = await getLibraryCached();
      if (legacy != null) return legacy;
    }
    throw err;
  }
  const token = await AsyncStorage.getItem("token");
  if (token) {
    // JSON.stringify de un array ignora la propiedad fromCache → caché legacy limpia.
    await AsyncStorage.setItem(`library:${token}`, JSON.stringify(data));
  }
  return data;
};

export const getLibraryCached = async () => {
  try {
    const token = await AsyncStorage.getItem("token");
    if (!token) return null;
    const raw = await AsyncStorage.getItem(`library:${token}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

export const warmup = () => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  fetch(`${API_URL}/health`, { signal: controller.signal })
    .then((res) => {
      if (res.ok) markOnline();
    })
    .catch((err) => {
      // El arranque sin señal se conoce desde el primer frame: los reads de la
      // primera pantalla sirven la caché sin esperar el timeout.
      if (isNetworkError(err)) markOffline();
    })
    .finally(() => clearTimeout(timer));
};

export const searchBooks = async (q) => {
  const res = await request(`/books/search?q=${encodeURIComponent(q)}`);
  return res.books ?? [];
};

export const addBook = async (book, status = "pending") =>
  request("/user-books", {
    method: "POST",
    body: JSON.stringify({ ...book, status }),
  });

export const updateBook = async (id, data) =>
  request(`/user-books/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const deleteBook = async (id) =>
  request(`/user-books/${id}`, { method: "DELETE" });

export const reReadBook = async (id, startedAt) =>
  request(`/user-books/${id}/reread`, {
    method: "POST",
    body: JSON.stringify({ started_at: startedAt }),
  });

export const getReadingHistory = async (id) => request(`/user-books/${id}/history`);

export const checkBook = async (google_id) => request(`/user-books/check/${google_id}`);

export const getNotes = async (book_id) => request(`/notes/${book_id}`);

export const addNote = async (book_id, content, page) =>
  request("/notes", {
    method: "POST",
    body: JSON.stringify({ book_id, content, page }),
  });

export const deleteNote = async (id) => request(`/notes/${id}`, { method: "DELETE" });

export const updateNote = async (id, { content, page } = {}) =>
  request(`/notes/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ content, page }),
  });

export const updateBookPages = async (google_id, pages) =>
  request(`/books/${google_id}/pages`, {
    method: "PATCH",
    body: JSON.stringify({ pages }),
  });

export const updateBookFicha = async (id, data) =>
  request(`/books/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

// Sube la portada al API (que la guarda en Supabase Storage). El body es
// base64 de una imagen comprimida; necesita más tiempo que el default.
export const uploadBookCover = async (bookId, base64) => {
  const res = await request(`/books/${bookId}/cover`, {
    method: "POST",
    timeout: 60000,
    body: JSON.stringify({ image: base64 }),
  });
  return res.cover;
};

export const getStats = async (year) => getWithCache(year ? `/stats?year=${year}` : "/stats");

export const getStatsActivity = async ({ view, year, month, date }) => {
  const params = [`view=${view}`];
  if (year) params.push(`year=${year}`);
  if (month) params.push(`month=${month}`);
  if (date) params.push(`date=${date}`);
  return getWithCache(`/stats/activity?${params.join("&")}`);
};

export const getStreak = async () => getWithCache("/stats/streak");

export const getAllNotes = async () => request("/notes");

export const addReadingSession = async (user_book_id, page, duration_seconds, pages_read, book_completed, start_page, clientId) =>
  request("/reading-sessions", {
    method: "POST",
    body: JSON.stringify({ user_book_id, page, start_page, duration_seconds, pages_read, book_completed, ...(clientId ? { client_id: clientId } : {}) }),
  });

export const getReadingSessions = async (user_book_id, date) =>
  request(
    `/reading-sessions/${user_book_id}${date ? `?date=${encodeURIComponent(date)}` : ""}`
  );

export const updateReadingSession = async (id, data) =>
  request(`/reading-sessions/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

export const getReadingSpeed = async (user_book_id) =>
  getWithCache(`/reading-sessions/${user_book_id}/speed`);

export const getReadingGoal = async () => getWithCache("/stats/goal");

export const updateReadingGoal = async (goal) =>
  request("/stats/goal", {
    method: "PATCH",
    body: JSON.stringify({ goal }),
  });

export const getGoals = async () => getWithCache("/goals");

export const getGoalsStatus = async () => getWithCache("/goals/status");

export const getGoalDetail = async (type, metric, year) =>
  getWithCache(`/goals/detail?type=${encodeURIComponent(type)}&metric=${encodeURIComponent(metric)}${year ? `&year=${year}` : ""}`);

export const getCalendar = async (year, month) =>
  getWithCache(`/calendar/${year}/${month}`);

export const saveGoal = async (type, metric, value) =>
  request("/goals", {
    method: "POST",
    body: JSON.stringify({ type, metric, value }),
  });

export const getAchievements = async () => getWithCache("/achievements");

export const markAchievementsSeen = async () => {
  const res = await request("/achievements/seen", {
    method: "POST",
    body: JSON.stringify({}),
  });
  const key = await cacheKey("/achievements");
  if (key) AsyncStorage.removeItem(key).catch(() => {});
  return res;
};

export const previewImport = async (csv) =>
  request("/import/preview", {
    method: "POST",
    body: JSON.stringify({ csv }),
  });

export const importBooks = async (csv) =>
  request("/import", {
    method: "POST",
    body: JSON.stringify({ csv }),
  });

export const previewImportBookmory = async (fileBase64) =>
  request("/import/bookmory/preview", {
    method: "POST",
    body: JSON.stringify({ file_base64: fileBase64 }),
  });

export const importBookmory = async (fileBase64) =>
  request("/import/bookmory", {
    method: "POST",
    body: JSON.stringify({ file_base64: fileBase64 }),
  });

export const requestRegistrationCode = async (email) =>
  request("/auth/request-register-code", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const requestPasswordReset = async (email) =>
  request("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });

export const verifyResetCode = async (email, code) =>
  request("/auth/verify-reset-code", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });

export const resetPassword = async (email, code, newPassword) =>
  request("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ email, code, newPassword }),
  });