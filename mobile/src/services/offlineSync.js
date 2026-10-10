import { AppState } from "react-native";
import { updateBook, addReadingSession } from "./api";
import { getPending, flushQueue, requeueFailed } from "./offline";
import { getConnectivity, subscribe } from "./connectivity";

let flushing = false;
const failListeners = new Set();

// Aviso a la UI cuando hay sesiones que agotaron los intentos y pasaron a la
// zona muerta. La UI muestra un diálogo para reintentarlas o descartarlas.
export const subscribeOfflineFailures = (fn) => {
  failListeners.add(fn);
  return () => failListeners.delete(fn);
};

const notifyFailures = (failed) => {
  if (failed <= 0) return;
  failListeners.forEach((fn) => fn({ failed }));
};

// Envía una operación encolada cuando hay red. Orden estricto (FIFO): primero
// el update de progreso del libro, luego la sesión (con client_id idempotente).
const submitItem = async (id, clientId, payload) => {
  const s = payload?.session;
  const updates = payload?.update;
  if (updates && s?.user_book_id) await updateBook(s.user_book_id, updates);
  if (s) {
    await addReadingSession(s.user_book_id, s.page, s.duration_seconds, s.pages_read, s.book_completed, s.start_page, clientId, s.started_at);
  }
};

export const syncQueue = async () => {
  if (flushing) return;
  const pending = await getPending();
  if (pending.length === 0) return;
  flushing = true;
  try {
    const result = await flushQueue(submitItem);
    notifyFailures(result?.failed ?? 0);
    return result;
  } catch {
    return null;
  } finally {
    flushing = false;
  }
};

// Reintento manual desde el diálogo: devuelve los items de la zona muerta a la
// cola con intentos en cero y los vuelve a intentar subir.
export const retryFailed = async () => {
  await requeueFailed();
  return syncQueue();
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