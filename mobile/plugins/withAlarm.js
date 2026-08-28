const {
  withAndroidManifest,
  withDangerousMod,
  AndroidConfig,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

const PACKAGE_DOT = "com.alejandro.readtrack.alarm";

function ensurePermission(manifest, permission) {
  manifest.manifest["uses-permission"] =
    manifest.manifest["uses-permission"] || [];
  const exists = manifest.manifest["uses-permission"].some(
    (p) => p.$["android:name"] === permission
  );
  if (!exists) {
    manifest.manifest["uses-permission"].push({
      $: { "android:name": permission },
    });
  }
}

function ensureMainApplicationChildren(manifest) {
  const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
  app.receiver = app.receiver || [];
  app.activity = app.activity || [];

  const receiverExists = app.receiver.some(
    (r) => r.$["android:name"] === ".alarm.AlarmReceiver"
  );
  if (!receiverExists) {
    app.receiver.push({
      $: {
        "android:name": ".alarm.AlarmReceiver",
        "android:exported": "false",
      },
    });
  }

  const activityExists = app.activity.some(
    (a) => a.$["android:name"] === ".alarm.AlarmActivity"
  );
  if (!activityExists) {
    app.activity.push({
      $: {
        "android:name": ".alarm.AlarmActivity",
        "android:exported": "true",
        "android:launchMode": "singleTop",
        "android:theme": "@android:style/Theme.NoTitleBar.Fullscreen",
      },
    });
  }

  return manifest;
}

function copyNativeSources(projectRoot) {
  const sourceDir = path.join(projectRoot, "alarm-native");
  const destDir = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "alejandro",
    "readtrack",
    "alarm"
  );
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(destDir, { recursive: true });
  for (const file of fs.readdirSync(sourceDir)) {
    if (file.endsWith(".kt")) {
      fs.copyFileSync(path.join(sourceDir, file), path.join(destDir, file));
    }
  }
}

function registerPackageInMainApplication(projectRoot) {
  const mainAppPath = path.join(
    projectRoot,
    "android",
    "app",
    "src",
    "main",
    "java",
    "com",
    "alejandro",
    "readtrack",
    "MainApplication.kt"
  );
  if (!fs.existsSync(mainAppPath)) return;
  let content = fs.readFileSync(mainAppPath, "utf8");
  if (content.includes("AlarmPackage")) return;

  content = content.replace(
    "import expo.modules.ReactNativeHostWrapper",
    "import expo.modules.ReactNativeHostWrapper\nimport " + PACKAGE_DOT + ".AlarmPackage"
  );
  content = content.replace(
    "// add(MyReactNativePackage())",
    "// add(MyReactNativePackage())\n            add(AlarmPackage())"
  );
  fs.writeFileSync(mainAppPath, content);
}

module.exports = function withAlarm(config) {
  config = withAndroidManifest(config, (config) => {
    const manifest = config.modResults;
    ensurePermission(manifest, "android.permission.USE_FULL_SCREEN_INTENT");
    ensureMainApplicationChildren(manifest);
    return config;
  });

  config = withDangerousMod(config, [
    "android",
    (config) => {
      const projectRoot = config.modRequest.projectRoot;
      copyNativeSources(projectRoot);
      registerPackageInMainApplication(projectRoot);
      return config;
    },
  ]);

  return config;
};