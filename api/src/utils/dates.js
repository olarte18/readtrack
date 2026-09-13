// Única fuente de la zona horaria de la app. Las fechas en BD (created_at) son
// TIMESTAMP sin zona guardadas en UTC: TODA conversión a hora local pasa por aquí.
// NO agregar "America/Bogota" ni Intl.DateTimeFormat con timeZone en otros archivos.
const APP_TZ = "America/Bogota";

const yearFmt = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ, year: "numeric" });
const shortDateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Año actual (o de una fecha dada) según la zona de la app, no la del servidor.
function appYear(date = new Date()) {
  return Number(yearFmt.format(date));
}

// Fecha YYYY-MM-DD de hoy (o de una fecha dada) en la zona de la app.
function appDay(date = new Date()) {
  return shortDateFmt.format(date);
}

// Fragmentos SQL reutilizables. APP_TZ es constante propia (nunca input de
// usuario), por eso se interpola con seguridad.
const SQL = {
  // col AT TIME ZONE 'UTC' AT TIME ZONE 'America/Bogota'
  utcToApp: (col = "created_at") => `${col} AT TIME ZONE 'UTC' AT TIME ZONE '${APP_TZ}'`,
  // NOW() AT TIME ZONE 'America/Bogota'
  nowInApp: () => `NOW() AT TIME ZONE '${APP_TZ}'`,
  // TO_CHAR(col convertida, fmt)
  toChar: (col = "created_at", fmt = "YYYY-MM-DD") => `TO_CHAR(${SQL.utcToApp(col)}, '${fmt}')`,
};

module.exports = { APP_TZ, appYear, appDay, SQL };