// V2 — génère les vignettes PNG des nouveaux modèles de documents.
// Les ambiances ajoutées (Ardoise → Carbone) réutilisent la mise en page d'un modèle existant
// et ne changent que la palette : on recolore la vignette source (rendue par le vrai moteur PDF)
// au lieu d'installer un moteur de rendu externe. 20 modèles × 2 types = 40 vignettes.
// Usage : node tools/build-template-thumbnails.mjs
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(ROOT, 'backend/package.json'));
const PNG = require('png-js');
const PREVIEWS = path.join(ROOT, 'assets/templates/previews');

const models = [
  { style: 'ardoise', source: 'classic', accent: '#475569', dark: '#1f2937' },
  { style: 'azur', source: 'classic', accent: '#0284c7', dark: '#0c4a6e' },
  { style: 'terracotta', source: 'signature', accent: '#c2410c', dark: '#431407' },
  { style: 'foret', source: 'minimal', accent: '#15803d', dark: '#052e16' },
  { style: 'ivoire', source: 'signature', accent: '#8a6a2f', dark: '#3b2f1b' },
  { style: 'ocean', source: 'classic', accent: '#0e7490', dark: '#082f49' },
  { style: 'menthe', source: 'minimal', accent: '#0f766e', dark: '#042f2e' },
  { style: 'bordeaux', source: 'signature', accent: '#9f1239', dark: '#4c0519' },
  { style: 'indigo', source: 'classic', accent: '#4338ca', dark: '#1e1b4b' },
  { style: 'ambre', source: 'signature', accent: '#b45309', dark: '#431407' },
  { style: 'rubis', source: 'classic', accent: '#be123c', dark: '#4c0519' },
  { style: 'carbone', source: 'minimal', accent: '#334155', dark: '#0f172a' },
];
const basePalette = {
  classic: { accent: '#0b63ce', dark: '#0b1220' },
  minimal: { accent: '#155e75', dark: '#111827' },
  signature: { accent: '#a16207', dark: '#2b1f14' },
};

const rgb = hex => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const decode = file => new Promise((resolve, reject) => PNG.decode(file, resolve, reject));

function toHsl([r, g, b]) {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return [h * 360, s, l];
}

const hueNear = (a, b, tolerance = 32) => {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d) <= tolerance;
};

function recolor(pixels, from, to) {
  const [fromAccent, fromDark] = [rgb(from.accent), rgb(from.dark)];
  const [toAccent, toDark] = [rgb(to.accent), rgb(to.dark)];
  const fromAccentHsl = toHsl(fromAccent), fromDarkHsl = toHsl(fromDark);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 8) continue;
    const color = [pixels[i], pixels[i + 1], pixels[i + 2]];
    const [h, s, l] = toHsl(color);
    if (s > 0.22 && l > 0.08 && l < 0.94 && hueNear(h, fromAccentHsl[0])) {
      // Conserve l'intensité lumineuse du pixel d'origine pour ne pas écraser les dégradés.
      const ratio = fromAccentHsl[2] > 0.01 ? Math.min(1.6, Math.max(0.35, l / fromAccentHsl[2])) : 1;
      pixels[i] = Math.min(255, Math.round(toAccent[0] * ratio));
      pixels[i + 1] = Math.min(255, Math.round(toAccent[1] * ratio));
      pixels[i + 2] = Math.min(255, Math.round(toAccent[2] * ratio));
    } else if (l < 0.3 && s < 0.48) {
      const ratio = fromDarkHsl[2] > 0.01 ? Math.min(1.8, Math.max(0.4, l / fromDarkHsl[2])) : 1;
      pixels[i] = Math.min(255, Math.round(toDark[0] * ratio));
      pixels[i + 1] = Math.min(255, Math.round(toDark[1] * ratio));
      pixels[i + 2] = Math.min(255, Math.round(toDark[2] * ratio));
    }
  }
  return pixels;
}

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();
function crc32(buffer) {
  let c = -1;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  name.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([name, data])), 8 + data.length);
  return out;
}
function encodePng(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

let generated = 0;
for (const kind of ['quote', 'invoice']) {
  for (const model of models) {
    const source = path.join(PREVIEWS, `${kind}-aurion-${model.source}.png`);
    if (!fs.existsSync(source)) {
      console.warn(`⚠ source absente : ${path.relative(ROOT, source)}`);
      continue;
    }
    const png = PNG.load(source);
    const pixels = await decode(source);
    recolor(pixels, basePalette[model.source], model);
    const out = path.join(PREVIEWS, `${kind}-aurion-${model.style}.png`);
    fs.writeFileSync(out, encodePng(png.width, png.height, pixels));
    console.log(`✔ ${path.relative(ROOT, out)} (${png.width}×${png.height})`);
    generated++;
  }
}
console.log(`${generated} vignette(s) générée(s).`);
