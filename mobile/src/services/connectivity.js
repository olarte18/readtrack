// Estado de conectividad observado por los servicios de red (api.js) y
// consumido por AppShell para mostrar el indicador "sin conexión". Sin
// dependencias: un mini event-emitter con estado reactivo.
let listeners = new Set();
let state = { online: true, cached: false, lastFailure: null, graceUntil: null };

const emit = (next) => {
  state = next;
  listeners.forEach((l) => l(state));
};

// Un request intacto: hay señal y los datos vienen frescos.
export function markOnline({ servedFromCache = false } = {}) {
  emit({ online: true, cached: servedFromCache, lastFailure: null, graceUntil: null });
}

// La red falló o se sirvieron datos guardados (fromCache): probamos si hubo
// realmente una falla de red antes de marcar offline, así la caché reciente no
// prende el indicador de forma falsa.
export function markOffline() {
  emit({ online: false, cached: true, lastFailure: Date.now(), graceUntil: null });
}

// Ventana de gracia: el server puede estar despertando (cold start de Render) y
// la conexión cuelga sin ser una caída real. Durante la gracia seguimos online
// (sin indicador) y las lecturas sirven caché al instante mientras un probe de
// fondo busca la señal. Si expira sin respuesta, recién ahí se declara offline.
export function markGrace(ms) {
  emit({ ...state, online: true, cached: false, lastFailure: null, graceUntil: Date.now() + ms });
}

export function inGrace() {
  return state.online && state.graceUntil != null && Date.now() < state.graceUntil;
}

export function getConnectivity() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}