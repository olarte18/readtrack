import AsyncStorage from "@react-native-async-storage/async-storage";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.10:3000";

const getHeaders = async () => {
  const token = await AsyncStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const getLibrary = async () => {
  const res = await fetch(`${API_URL}/user-books`, { headers: await getHeaders() });
  return res.json();
};

export const addBook = async (book, status = "pending") => {
  const res = await fetch(`${API_URL}/user-books`, {
    method: "POST",
    headers: await getHeaders(),
    body: JSON.stringify({ ...book, status }),
  });
  return res.json();
};

export const updateBook = async (id, data) => {
  const res = await fetch(`${API_URL}/user-books/${id}`, {
    method: "PATCH",
    headers: await getHeaders(),
    body: JSON.stringify(data),
  });
  return res.json();
};

export const deleteBook = async (id) => {
  const res = await fetch(`${API_URL}/user-books/${id}`, {
    method: "DELETE",
    headers: await getHeaders(),
  });
  return res.json();
};

export const checkBook = async (google_id) => {
  const res = await fetch(`${API_URL}/user-books/check/${google_id}`, { headers: await getHeaders() });
  return res.json();
};

export const getNotes = async (book_id) => {
  const res = await fetch(`${API_URL}/notes/${book_id}`, { headers: await getHeaders() });
  return res.json();
};

export const addNote = async (book_id, content, page) => {
  const res = await fetch(`${API_URL}/notes`, {
    method: "POST",
    headers: await getHeaders(),
    body: JSON.stringify({ book_id, content, page }),
  });
  return res.json();
};

export const deleteNote = async (id) => {
  const res = await fetch(`${API_URL}/notes/${id}`, {
    method: "DELETE",
    headers: await getHeaders(),
  });
  return res.json();
};

export const updateBookPages = async (google_id, pages) => {
  const res = await fetch(`${API_URL}/books/${google_id}/pages`, {
    method: "PATCH",
    headers: await getHeaders(),
    body: JSON.stringify({ pages }),
  });
  return res.json();
};