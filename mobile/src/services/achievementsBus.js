// Bus mínimo para celebrar logros en cuanto se desbloquean, sin acoplar el
// servicio HTTP (api.js) a React. AppShell se suscribe y muestra la modal.
const listeners = new Set();

export const onAchievements = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const emitAchievements = (items) => {
  if (!items || items.length === 0) return;
  for (const fn of listeners) {
    try {
      fn(items);
    } catch {
      // un listener roto no debe afectar la llamada HTTP que lo originó
    }
  }
};
