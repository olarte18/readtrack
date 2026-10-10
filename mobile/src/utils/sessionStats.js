import { pagesEquivalent, pagesLeftEquivalent } from "./progress";

// Segundos de la sesión a partir de un "ancla" `{ base, at }`: proyección pura
// desde una marca de tiempo. A diferencia de sumar/restar 1 en cada tick, el
// valor sale de `Date.now()`, así que un tick retrasado (o la app en segundo
// plano) no acumula drift. Para temporizador `base` es el tiempo restante; para
// cronómetro, el transcurrido. Pausado, devuelve el `base` congelado.
export function sessionSeconds(isTimer, anchor, running, nowMs = Date.now()) {
  if (!anchor) return 0;
  const elapsed = running ? Math.floor((nowMs - anchor.at) / 1000) : 0;
  const value = isTimer ? anchor.base - elapsed : anchor.base + elapsed;
  return Math.max(0, value);
}

// Estadísticas vivas de la sesión de lectura. `seconds` es el valor actual del
// reloj (tiempo restante en temporizador, transcurrido en cronómetro).
export function computeSessionStats({ book, endPage, startPage, avgSpeed, isTimer, duration, seconds }) {
  const hoursElapsed = (isTimer ? (duration ?? 0) - seconds : seconds) / 3600;
  const equivalentPages = pagesEquivalent(book, endPage, startPage);
  const estimatedEqPages = avgSpeed && hoursElapsed > 0 ? Math.round(avgSpeed * hoursElapsed) : null;
  const currentSpeedH = hoursElapsed > 0 && equivalentPages > 0 ? equivalentPages / hoursElapsed : 0;
  const effectiveSpeed = currentSpeedH > 0 ? (avgSpeed ? (currentSpeedH + avgSpeed) / 2 : currentSpeedH) : (avgSpeed ?? 0);
  const pagesPerHour = effectiveSpeed;
  const remainingEqPages = pagesLeftEquivalent(book, endPage);
  const minutesLeft = pagesPerHour > 0 && remainingEqPages !== null ? remainingEqPages / (pagesPerHour / 60) : null;

  const readingMode = book?.reading_mode ?? "page";
  const readLabel =
    readingMode === "page" ? "Páginas leídas" : readingMode === "percentage" ? "Avance" : "Capítulos";
  const readValue =
    estimatedEqPages == null
      ? "—"
      : readingMode === "page"
        ? String(estimatedEqPages)
        : readingMode === "percentage"
          ? book.pages ? `${Math.round((estimatedEqPages / book.pages) * 100)}%` : "—"
          : book.pages && book.chapters ? String(Math.round((estimatedEqPages / book.pages) * book.chapters)) : "—";

  return { pagesPerHour, readLabel, readValue, minutesLeft };
}
