// Configuración SSL para la conexión a PostgreSQL.
// - DB_SSL=true habilita SSL con verificación de certificado POR DEFECTO.
// - DB_SSL_INSECURE=true desactiva la verificación (SOLO dev local contra
//   certificados self-signed; nunca en producción).
// - DB_CA_CERT es el CA bundle (p. ej. Supabase), con saltos de línea reales.
function dbSsl() {
  if (process.env.DB_SSL !== "true") return undefined;
  const cert = process.env.DB_CA_CERT ? process.env.DB_CA_CERT.replace(/\\n/g, "\n") : undefined;
  return {
    rejectUnauthorized: process.env.DB_SSL_INSECURE !== "true",
    ...(cert ? { ca: cert } : {}),
  };
}

module.exports = { dbSsl };