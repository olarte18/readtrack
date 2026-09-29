const { withAndroidManifest, AndroidConfig } = require("@expo/config-plugins");

// Desactiva el backup de Android por completo: con `allowBackup=false` la app
// no se respalda en Google Cloud ni se restaura en otro dispositivo. Aplica a
// la caché/cola local y, junto con el `configureAndroidBackup:false` de
// expo-secure-store, mantiene los tokens solo en el Keystore del dispositivo.
module.exports = function withNoBackup(config) {
  config = withAndroidManifest(config, (config) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(
      config.modResults
    );
    app.$["android:allowBackup"] = "false";
    delete app.$["android:fullBackupContent"];
    delete app.$["android:dataExtractionRules"];
    return config;
  });
  return config;
};