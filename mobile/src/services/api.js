const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.1.10:3000";

export const getLibrary = async () => {
  const res = await fetch(`${API_URL}/user-books`);
  return res.json();
};

export const addBook = async (book, status = "pending") => {
  const res = await fetch(`${API_URL}/user-books`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...book, status }),
  });
  return res.json();
};

export const updateBook = async (id, data) => {
  const res = await fetch(`${API_URL}/user-books/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json();
};

export const deleteBook = async (id) => {
  const res = await fetch(`${API_URL}/user-books/${id}`, {
    method: "DELETE",
  });
  return res.json();
};
export const checkBook = async (google_id) => {
  const res = await fetch(`${API_URL}/user-books/check/${google_id}`);
  return res.json();
};
export const getNotes = async (book_id) => {
  const res = await fetch(`${API_URL}/notes/${book_id}`);
  return res.json();
};

export const addNote = async (book_id, content, page) => {
  const res = await fetch(`${API_URL}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ book_id, content, page }),
  });
  return res.json();
};

export const deleteNote = async (id) => {
  const res = await fetch(`${API_URL}/notes/${id}`, { method: "DELETE" });
  return res.json();
};