import AsyncStorage from "@react-native-async-storage/async-storage";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.10:3000";

const getHeaders = async () => {
  const token = await AsyncStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

const request = async (path, options = {}) => {
  const res = await fetch(`${API_URL}${path}`, {
    headers: await getHeaders(),
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
  return data;
};

export const getLibrary = async () => request("/user-books");

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

export const getStats = async () => request("/stats");

export const addReadingSession = async (user_book_id, page, duration_seconds, pages_read) =>
  request("/reading-sessions", {
    method: "POST",
    body: JSON.stringify({ user_book_id, page, duration_seconds, pages_read }),
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

export const saveGoal = async (type, metric, value) =>
  request("/goals", {
    method: "POST",
    body: JSON.stringify({ type, metric, value }),
  });