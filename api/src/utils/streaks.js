const DAY_MS = 86400000;
const APP_TZ = "America/Bogota";

// Fecha de hoy según la zona de la app, no la del servidor (UTC en Render).
const todayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const diffDays = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

// Rachas de días consecutivos con al menos una sesión registrada.
// El día en curso no rompe la racha hasta que termina sin sesiones.
// Trabaja solo con strings YYYY-MM-DD para evitar corrimientos de zona.
function computeStreaks(dates) {
  const set = new Set(dates);
  const stepBack = (date) => new Date(Date.parse(`${date}T00:00:00Z`) - DAY_MS).toISOString().split("T")[0];

  let current = 0;
  let cursor = todayFmt.format(new Date());
  if (!set.has(cursor)) cursor = stepBack(cursor);
  while (set.has(cursor)) {
    current++;
    cursor = stepBack(cursor);
  }

  let best = 0;
  let run = 0;
  let prev = null;
  for (const date of [...set].sort()) {
    run = prev && diffDays(prev, date) === 1 ? run + 1 : 1;
    prev = date;
    if (run > best) best = run;
  }

  return { current, best };
}

module.exports = { computeStreaks };
