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
