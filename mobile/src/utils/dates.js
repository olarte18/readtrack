// Única fuente de la fecha en zona de la app en mobile (America/Bogota).
// Los strings YYYY-MM-DD se trabajan sin instantes para evitar corrimientos.
export const APP_TZ = "America/Bogota";

export const todayString = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

// Suma/resta días a un YYYY-MM-DD sin saltos de zona horaria.
export const addDays = (iso, diffDays) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + diffDays);
  return d.toISOString().slice(0, 10);
};

export const diffDays = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export const nowIso = () => new Date().toISOString();