// Antí-regresión de accesibilidad: cuenta controles táctiles sin
// accessibilityRole/accessibilityLabel y aborta (exit != 0) si quedan.
// Uso: `node scripts/check-a11y.js` o `npm run a11y`.
const fs = require("fs");
const path = require("path");

const SRC = path.join(__dirname, "..", "src");
const ROOT = path.join(__dirname, "..");
const TAGS = ["TouchableOpacity", "TouchableHighlight", "TouchableWithoutFeedback", "Pressable"];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

// Devuelve [start, end] del bloque JSX del tag en `source` desde `openIdx`.
function tagBounds(source, tagName, openIdx) {
  const open = source.indexOf(">", openIdx);
  if (open === -1) return null;
  if (source[open - 1] === "/") return [openIdx, open + 1]; // self-closing
  const closeTag = `</${tagName}>`;
  const close = source.indexOf(closeTag, open);
  if (close === -1) return null;
  return [openIdx, close + closeTag.length];
}

function collect(srcPath) {
  const source = fs.readFileSync(srcPath, "utf8");
  const items = [];
  let cursor = 0;
  while (cursor < source.length) {
    let best = -1;
    let bestTag = null;
    for (const t of TAGS) {
      const idx = source.indexOf(`<${t}`, cursor);
      if (idx !== -1 && (best === -1 || idx < best)) {
        best = idx;
        bestTag = t;
      }
    }
    if (best === -1) break;
    const bounds = tagBounds(source, bestTag, best + 1);
    if (!bounds) break;
    const block = source.slice(bounds[0], bounds[1]);
    const ok =
      /accessibilityRole\s*=/.test(block) ||
      /accessibilityLabel\s*=/.test(block) ||
      // Decorative / backdrop: oculto explícitamente del árbol de accesibilidad
      /accessible\s*=\{\s*false\s*\}/.test(block);
    items.push({ tag: bestTag, ok, block });
    cursor = bounds[1];
  }
  return items;
}

const files = [];
for (const f of ["App.js"]) {
  const p = path.join(ROOT, f);
  if (fs.existsSync(p)) files.push(p);
}
files.push(...walk(SRC));
let accessible = 0;
let missing = 0;
const perFile = [];

for (const file of files) {
  const items = collect(file);
  const okCount = items.filter((i) => i.ok).length;
  const rel = path.relative(src_dir_for_print(), file);
  accessible += okCount;
  missing += items.length - okCount;
  perFile.push({ rel, total: items.length, ok: okCount });
}

function src_dir_for_print() {
  return path.join(__dirname, "..");
}

console.log("=== Accesibilidad: controles táctiles ===");
let total = 0;
for (const f of perFile) {
  total += f.total;
  if (f.total > 0) {
    const mark = f.ok === f.total ? "OK " : "  ";
    console.log(`${mark}${f.rel}  ${f.ok}/${f.total}`);
  }
}
console.log(`\nTotal: ${accessible}/${total} controles con rol/label`);
if (missing > 0) {
  console.error(`Faltan accesibilidad en ${missing} controles.`);
  process.exit(1);
}
console.log("Sin controles sin rol/label.");