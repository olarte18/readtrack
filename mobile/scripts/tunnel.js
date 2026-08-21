const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const PORT = process.env.API_PORT || 3000;
const ENV_PATH = path.join(__dirname, "..", ".env");
// Resuelvo el CLI moderno directo: @expo/ngrok-bin pisa .bin/ngrok con un agente viejo sin --domain
const NGROK_BIN = require.resolve("ngrok/bin/ngrok");

function ngrok(args, opts = {}) {
  return spawn(NGROK_BIN, args, opts);
}

function readEnvKey(key) {
  const env = fs.readFileSync(ENV_PATH, "utf8");
  const m = env.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim() : null;
}

function writeEnvKey(key, value) {
  let env = fs.readFileSync(ENV_PATH, "utf8");
  if (new RegExp(`^${key}=.*$`, "m").test(env)) {
    env = env.replace(new RegExp(`^${key}=.*$`, "m"), `${key}=${value}`);
  } else {
    env = env.trimEnd() + `\n\n${key}=${value}\n`;
  }
  fs.writeFileSync(ENV_PATH, env);
}

const DOMAIN = process.env.NGROK_DOMAIN || readEnvKey("NGROK_DOMAIN");

if (!DOMAIN) {
  console.log(`
Falta el dominio fijo de ngrok.

1. Creá cuenta gratis en https://dashboard.ngrok.com/signup
2. Copiá tu authtoken: https://dashboard.ngrok.com/get-started/your-authtoken
   y corré:  npx ngrok config add-authtoken TU_TOKEN
3. Copiá tu dev domain: https://dashboard.ngrok.com/domains
4. Agregalo a mobile/.env como:  NGROK_DOMAIN=tu-dominio.ngrok-free.dev

y volvé a correr npm run api:tunnel`);
  process.exit(1);
}

function ensureAuthtoken(cb) {
  const check = ngrok(["config", "check"], { stdio: "ignore" });
  check.on("exit", (code) => {
    if (code === 0) return cb();
    const token = process.env.NGROK_AUTHTOKEN || readEnvKey("NGROK_AUTHTOKEN");
    if (!token) {
      console.log(`
Falta el authtoken de ngrok.

Corré una sola vez:  cd mobile && npx ngrok config add-authtoken TU_TOKEN
(token en https://dashboard.ngrok.com/get-started/your-authtoken)
o agregalo a mobile/.env como:  NGROK_AUTHTOKEN=TU_TOKEN`);
      process.exit(1);
    }
    console.log("Configurando authtoken de ngrok...");
    const add = ngrok(["config", "add-authtoken", token], { stdio: "inherit" });
    add.on("exit", (c) => (c === 0 ? cb() : process.exit(1)));
  });
}

let attempts = 0;

function connect() {
  attempts += 1;
  if (attempts > 20) {
    console.log("Demasiados reintentos fallidos. Revisá tu conexión y volvé a correr npm run api:tunnel.");
    process.exit(1);
  }
  console.log(`Levantando túnel fijo https://${DOMAIN} → localhost:${PORT} (intento ${attempts})...`);

  const tunnel = ngrok(
    ["http", String(PORT), "--domain=" + DOMAIN],
    { stdio: ["ignore", "pipe", "pipe"] }
  );

  let fatal = false;

  const onData = (d) => {
    const text = d.toString();
    process.stdout.write(text);
    if (/ERR_NGROK_/.test(text)) {
      fatal = true;
      console.log("\nError de ngrok (arriba). Si es ERR_NGROK_15013 reclamá tu dominio en https://dashboard.ngrok.com/domains. Si es de authtoken, corré npx ngrok config add-authtoken TU_TOKEN.");
      tunnel.kill();
    }
  };

  tunnel.stdout.on("data", onData);
  tunnel.stderr.on("data", onData);

  tunnel.on("exit", () => {
    if (fatal) process.exit(1);
    console.log("Túnel cerrado. Reintentando en 3s...");
    setTimeout(connect, 3000);
  });
}

ensureAuthtoken(() => {
  writeEnvKey("EXPO_PUBLIC_API_URL", `https://${DOMAIN}`);
  console.log(`→ EXPO_PUBLIC_API_URL fijado a https://${DOMAIN} en mobile/.env`);
  connect();
});