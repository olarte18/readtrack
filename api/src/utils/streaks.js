const DAY_MS = 86400000;
const toDate = (d) => d.toISOString().split("T")[0];
const diffDays = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);

// Rachas de días consecutivos con al menos una sesión registrada.
// El día en curso no rompe la racha hasta que termina sin sesiones.
function computeStreaks(dates) {
  const set = new Set(dates);
  const today = new Date();
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  let current = 0;
  if (!set.has(toDate(cursor))) cursor.setUTCDate(cursor.getUTCDate() - 1);
  while (set.has(toDate(cursor))) {
    current++;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
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
