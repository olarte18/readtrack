import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL } from "../utils/config";
import { markOnline, markOffline } from "./connectivity";

const getHeaders = async () => {
  const token = await AsyncStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const DEFAULT_TIMEOUT = 30000;
const RETRY_DELAYS = [1500, 3000];

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

// GET con soporte offline: ante éxito guarda la última respuesta; ante fallo
// de red sirve la caché con fromCache:true (si la hay) para que las pantallas
// sigan funcionando sin señal.
const getWithCache = async (path, options = {}) => {
  try {
    const data = await request(path, options);
    writeCached(path, data);
    return data;
  } catch (err) {
    if (isNetworkError(err)) {
      const cached = await readCached(path);
      if (cached != null) {
        markOffline();
        return { ...cached, fromCache: true };
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
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
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
      return data;
    } catch (err) {
      clearTimeout(timer);
      const retryable = isNetworkError(err);
      if (retryable && attempt < maxRetries) {
        attempt += 1;
        await sleep(RETRY_DELAYS[attempt - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]);
        continue;
      }
      if (retryable) markOffline();
      throw err;
    }
  }
};

export const getLibrary = async () => {
  const data = await getWithCache("/user-books");
  const token = await AsyncStorage.getItem("token");
  if (token) await AsyncStorage.setItem(`library:${token}`, JSON.stringify(data));
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
    .catch(() => {})
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

export const checkBook = async (google_id) => request(`/user-books/check/${google_id}`);

export const getNotes = async (book_id) => request(`/notes/${book_id}`);

export const addNote = async (book_id, content, page) =>
  request("/notes", {
    method: "POST",
    body: JSON.stringify({ book_id, content, page }),
  });

export const deleteNote = async (id) => request(`/notes/${id}`, { method: "DELETE" });

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