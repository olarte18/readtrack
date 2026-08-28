import AsyncStorage from "@react-native-async-storage/async-storage";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.10:3000";

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

const request = async (path, options = {}) => {
  const { timeout = DEFAULT_TIMEOUT, retry, retries, ...fetchOptions } = options;
  const isGet = (fetchOptions.method || "GET") === "GET";
  const maxRetries = retry === false ? 0 : (retries ?? (isGet ? 2 : 0));
  let attempt = 0;

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
        // Token de una cuenta eliminada o sesión inválida: forzar re-login
        await AsyncStorage.removeItem("token");
        throw new Error(data.error || "Tu sesión expiró. Inicia sesión de nuevo.");
      }
      if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
      return data;
    } catch (err) {
      clearTimeout(timer);
      const retryable = err.name === "AbortError" || err.message === "Network request failed";
      if (retryable && attempt < maxRetries) {
        attempt += 1;
        await sleep(RETRY_DELAYS[attempt - 1] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]);
        continue;
      }
      throw err;
    }
  }
};

export const getLibrary = async () => {
  const data = await request("/user-books");
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

export const getStats = async () => request("/stats");

export const getStreak = async () => request("/stats/streak");

export const getAllNotes = async () => request("/notes");

export const addReadingSession = async (user_book_id, page, duration_seconds, pages_read) =>
  request("/reading-sessions", {
    method: "POST",
    body: JSON.stringify({ user_book_id, page, duration_seconds, pages_read }),
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
  request(`/reading-sessions/${user_book_id}/speed`);

export const getReadingGoal = async () => request("/stats/goal");

export const updateReadingGoal = async (goal) =>
  request("/stats/goal", {
    method: "PATCH",
    body: JSON.stringify({ goal }),
  });

export const getGoals = async () => request("/goals");

export const getCalendar = async (year, month) =>
  request(`/calendar/${year}/${month}`);

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