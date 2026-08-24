require("dotenv").config();
const app = require("./app");
const pool = require("./db/connection");
const { applySchema } = require("./db/setup");

const PORT = process.env.PORT || 3000;

(async () => {
  // Aplica el esquema en cada arranque: garantiza que tablas y columnas
  // nuevas existan también en producción sin pasos manuales.
  try {
    await applySchema(pool);
    console.log("Esquema verificado al arrancar");
  } catch (e) {
    console.error("No se pudo aplicar el esquema al arrancar:", e.message);
    process.exit(1);
  }

  app.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`));
})();
