// Estado de conectividad observado por los servicios de red (api.js) y
// consumido por AppShell para mostrar el indicador "sin conexión". Sin
// dependencias: un mini event-emitter con estado reactivo.
let listeners = new Set();
let state = { online: true, cached: false, lastFailure: null };

const emit = (next) => {
  state = next;
  listeners.forEach((l) => l(state));
};

// Un request intacto: hay señal y los datos vienen frescos.
export function markOnline({ servedFromCache = false } = {}) {
  emit({ online: true, cached: servedFromCache, lastFailure: null });
}

// La red falló o se sirvieron datos guardados (fromCache): probamos si hubo
// realmente una falla de red antes de marcar offline, así la caché reciente no
// prende el indicador de forma falsa.
export function markOffline() {
  emit({ online: false, cached: true, lastFailure: Date.now() });
}

export function getConnectivity() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}