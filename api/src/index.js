require("dotenv").config();
const app = require("./app");
const pool = require("./db/connection");
const { applySchema } = require("./db/setup");

const PORT = process.env.PORT || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const AUTO_MIGRATE = process.env.AUTO_MIGRATE === "true" || !IS_PRODUCTION;

(async () => {
  if (AUTO_MIGRATE) {
    try {
      await applySchema(pool);
      console.log("Esquema verificado al arrancar");
    } catch (e) {
      console.error("No se pudo aplicar el esquema al arrancar:", e.message);
      process.exit(1);
    }
  } else {
    console.warn(
      "AUTO_MIGRATE desactivado: la BD no se modificó al arrancar. " +
        "Aplicá los cambios manualmente con `npm run db:setup` (o activá AUTO_MIGRATE=true)."
    );
  }

  app.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`));
})();