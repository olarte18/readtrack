const AdmZip = require("adm-zip");
const initSqlJs = require("sql.js");
const path = require("path");
const httpError = require("./httpError");

// Lee un archivo .bookmory (zip con bases Sembast) y devuelve los stores
// normalizados: books, notes, tags, streakCaches, goals, yearlyGoals, collections.
//
// Bookmory guarda sus datos en dos contenedores Sembast:
//  - bookmory.db (JSON lines plano)
//  - new_bookmory.db (SQLite con tabla entry(store, key, value))
// El SQLite es el completo (incluye streak_caches), así que se usa ese como
// fuente principal y el plano solo como respaldo si faltara.

const APP_TZ = "America/Bogota";
const dayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Fecha YYYY-MM-DD en hora Colombia para un epoch en milisegundos.
const bogotaDay = (ms) => dayFmt.format(new Date(ms));

function parseFlatSembast(text) {
  const stores = {};
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const store = rec.store;
    if (!store || store === "_main") continue;
    if (!stores[store]) stores[store] = [];
    stores[store].push({ key: String(rec.key ?? ""), value: rec.value ?? {} });
  }
  return stores;
}

function parseSqliteSembast(bytes) {
  const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
  // sql.js resuelve el wasm relativo a su propio directorio al usarlo en Node
  // con locateFile apuntando al path absoluto del paquete instalado.
  return initSqlJs({ locateFile: () => wasmPath }).then((SQL) => {
    const db = new SQL.Database(bytes);
    const stores = {};
    try {
      const stmt = db.prepare("SELECT store, key, value FROM entry WHERE deleted IS NULL OR deleted = 0");
      while (stmt.step()) {
        const row = stmt.getAsObject();
        const store = row.store;
        if (!store || store === "_main") continue;
        if (!stores[store]) stores[store] = [];
        let value = {};
        try { value = JSON.parse(row.value); } catch { value = {}; }
        stores[store].push({ key: String(row.key), value });
      }
      stmt.free();
    } finally {
      db.close();
    }
    return stores;
  });
}

function normalizeStores(sqliteStores, flatStores) {
  const merged = {};
  const sources = [flatStores, sqliteStores];
  for (const src of sources) {
    for (const [name, rows] of Object.entries(src)) {
      merged[name] = rows; // el SQLite se procesa de último y gana
    }
  }
  return merged;
}

async function parseBookmory(buffer) {
  let zip;
  try {
    zip = new AdmZip(buffer);
  } catch {
    throw httpError(400, "El archivo no parece un respaldo de Bookmory válido (.bookmory)");
  }
  const entries = zip.getEntries();
  if (!entries.some((entry) => entry.entryName.toLowerCase().endsWith("bookmory.db"))) {
    throw httpError(400, "El respaldo no contiene la base de datos de Bookmory");
  }
  let sqliteStores = {};
  let flatStores = {};
  for (const entry of zip.getEntries()) {
    const name = entry.entryName.toLowerCase();
    if (!entry.isDirectory && name.endsWith("bookmory.db")) {
      const bytes = entry.getData();
      if (bytes.length > 16 && bytes.slice(0, 15).toString("latin1").startsWith("SQLite format 3")) {
        sqliteStores = await parseSqliteSembast(bytes);
      } else {
        flatStores = parseFlatSembast(bytes.toString("utf8"));
      }
    }
  }

  const all = normalizeStores(sqliteStores, flatStores);
  const firstOf = (name) => (all[name] ?? []).map((r) => r.value);

  const books = (all.books ?? []).map(({ key, value }) => ({ bid: key, ...value }));
  const streakCaches = firstOf("streak_caches")
    .map((s) => ({ dateMs: s.date, bids: s.bids ?? [] }))
    .sort((a, b) => a.dateMs - b.dateMs);
  const tags = firstOf("tags");
  const notes = (all.notes ?? []).map(({ key, value }) => ({ nid: key, ...value }));
  const yearlyGoals = firstOf("yearly_goal");
  const dailyGoalRaw = firstOf("goal")[0] ?? null;

  return {
    books,
    streakCaches,
    tags,
    notes,
    yearlyGoals,
    dailyGoal: dailyGoalRaw
      ? { seconds: Number(dailyGoalRaw.goal) || 0 }
      : null,
  };
}

module.exports = { parseBookmory, bogotaDay };
