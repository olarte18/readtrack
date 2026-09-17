import { AppState } from "react-native";
import { updateBook, addReadingSession } from "./api";
import { getPending, flushQueue } from "./offline";
import { getConnectivity, subscribe } from "./connectivity";

let flushing = false;

// Envía una operación encolada cuando hay red. Orden estricto (FIFO): primero
// el update de progreso del libro, luego la sesión (con client_id idempotente).
const submitItem = async (id, clientId, payload) => {
  const s = payload?.session;
  const updates = payload?.update;
  if (updates && s?.user_book_id) await updateBook(s.user_book_id, updates);
  if (s) {
    await addReadingSession(s.user_book_id, s.page, s.duration_seconds, s.pages_read, s.book_completed, s.start_page, clientId);
  }
};

export const syncQueue = async () => {
  if (flushing) return;
  const pending = await getPending();
  if (pending.length === 0) return;
  flushing = true;
  try {
    const result = await flushQueue(submitItem);
    return result;
  } catch {
    return null;
  } finally {
    flushing = false;
  }
};

// Flush al arrancar y cada vez que la app vuelve a primer plano (cuando hay
// red se propagan en el request; aquí cubrimos la vuelta de avión/sin señal).
// Además se intenta de inmediato cuando la conectividad pasa de offline a
// online, sin esperar a que la app vuelva a primer plano.
export const initOfflineSync = () => {
  syncQueue();
  const sub = AppState.addEventListener("change", (next) => {
    if (next === "active") syncQueue();
  });
  let wasOnline = getConnectivity().online;
  const unsub = subscribe((state) => {
    if (state.online && !wasOnline) syncQueue();
    wasOnline = state.online;
  });
  return () => {
    sub.remove();
    unsub();
  };
};