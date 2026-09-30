// Anti-regresión de contraste WCAG AA (texto normal ≥ 4.5:1).
// Valida los colores de las paletas (`src/contexts/ThemeContext.js`) contra los
// fondos donde se usan y aborta (exit != 0) si algo cae por debajo.
// Uso: `node scripts/check-contrast.js` o `npm run contrast`.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src", "contexts", "ThemeContext.js");

function luminance(hex) {
  let c = hex.replace("#", "").trim();
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(fg, bg) {
  const a = luminance(fg);
  const b = luminance(bg);
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}

// Extrae las dos paletas del ThemeContext.js (objeto `palettes`).
function readPalettes() {
  const source = fs.readFileSync(SRC, "utf8");
  const parse = (key) => {
    const start = source.indexOf(`${key}: {`);
    if (start === -1) throw new Error(`Paleta "${key}" no encontrada`);
    const open = source.indexOf("{", start);
    const close = source.indexOf("\n  },", open);
    if (close === -1) throw new Error(`Paleta "${key}" sin cierre`);
    const colors = {};
    const re = /([a-zA-Z0-9]+): "(#[0-9a-fA-F]{3,6})"/g;
    let mm;
    while ((mm = re.exec(source.slice(open, close)))) colors[mm[1]] = mm[2];
    return colors;
  };
  return { dark: parse("dark"), light: parse("light") };
}

// Pares (token texto, fondos donde se usa) por tema. Los fondos son tokens de la
// misma paleta o hex fijos (p. ej. el modo simple de lectura sobre negro).
const CHECKS = {
  dark: [
    ["text", ["background", "surface", "surfaceAlt"]],
    ["textMuted", ["background", "surface", "surfaceAlt"]],
    ["textDim", ["background", "surface", "surfaceAlt"]],
    ["placeholder", ["input"]],
    ["accent", ["background", "surface", "surfaceAlt"]],
    ["star", ["background", "surface", "surfaceAlt"]],
    ["danger", ["background", "surface", "surfaceAlt"]],
    ["onAccent", ["accent"]],
  ],
  light: [
    ["text", ["background", "surface", "surfaceAlt"]],
    ["textMuted", ["background", "surface", "surfaceAlt"]],
    ["textDim", ["background", "surface", "surfaceAlt"]],
    ["placeholder", ["input"]],
    ["accent", ["background", "surface", "surfaceAlt"]],
    ["star", ["background", "surface", "surfaceAlt"]],
    ["danger", ["background", "surface", "surfaceAlt"]],
    ["onAccent", ["accent"]],
  ],
};

// Casos especiales con fondos fijos fuera de la paleta.
const EXTRA = [
  // Modo simple de lectura (ActiveSessionScreen): fondo negro fijo.
  ["dark", "textDim", "#949494", "#000000"],
  ["dark", "textMuted", "#aaaaaa", "#000000"],
  // Días del calendario sobre celdas de color (mismos tonos en ambos temas).
  ["both", "dayTextComplete", "#13131f", "#7ee787"],
  ["both", "dayTextSecret", "#13131f", "#42a5f5"],
  ["both", "dayTextActive", "#ffffff", "#6c5ce7"],
];

const MIN = 4.5;
let failures = 0;

const palettes = readPalettes();
const report = [];

const addReport = ({ fg, bg, bgLabel, label }) => {
  const r = ratio(fg, bg);
  const ok = r >= MIN;
  if (!ok) failures++;
  report.push({ ok, fg, bg: bgLabel ?? bg, r, label });
};

// Casos con fondos fijos fuera de la paleta (p. ej. calendario y modo simple).
// Se evalúan una sola vez, no por tema.
for (const [tokenTheme, fgToken, fgHex, bgHex] of EXTRA) {
  if (tokenTheme === "both") {
    addReport({ fg: fgHex, bg: bgHex, label: "calendar day text" });
  } else {
    const fg = palettes[tokenTheme][fgToken];
    if (fg === undefined) continue;
    addReport({ fg, bg: bgHex, label: "simple mode text" });
  }
}

for (const theme of ["dark", "light"]) {
  const p = palettes[theme];
  for (const [fg, bgsList] of CHECKS[theme]) {
    for (const bgToken of bgsList) {
      const bg = p[bgToken] ?? null;
      if (!bg) continue;
      addReport({ fg: p[fg], bg, bgLabel: `${bgToken} (${bg})`, label: `[${theme}] ${fg}` });
    }
  }
}

console.log("=== Contraste WCAG AA (min 4.5:1) ===");
for (const row of report.sort((a, b) => a.r - b.r)) {
  const mark = row.ok ? "OK " : "  ";
  console.log(`${mark}${row.label.padEnd(24)} ${row.fg.padEnd(9)} on ${row.bg.padEnd(24)} => ${row.r.toFixed(2)}:1`);
}
console.log(`\nTotal: ${report.length} checks, ${failures} bajo 4.5:1`);
if (failures > 0) {
  console.error(`${failures} combinaciones sin contraste suficiente.`);
  process.exit(1);
}
console.log("Todo supera 4.5:1.");