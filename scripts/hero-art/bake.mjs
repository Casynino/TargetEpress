// Bakes the homepage picture: the owner's key art (source.webp, untouched) with
// its golden route turned Target red (#D81E2A family). Only the warm, golden
// pixels inside a band along the route change, so the sea and the land around
// it keep their colour. Writes public/brand/hero-art.webp.
//
//   node scripts/hero-art/bake.mjs
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const sharp = require("sharp");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");

// The route, traced from the picture's own golden line (the same path hero-art.tsx animates on).
const ROUTE = readFileSync(path.join(ROOT, "components/site/hero-art.tsx"), "utf8").match(/const ROUTE = "([^"]+)"/)[1];
const N = 1254;
const band = await sharp(Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}"><rect width="${N}" height="${N}" fill="#000"/>` +
  `<path d="${ROUTE}" fill="none" stroke="#fff" stroke-width="58" stroke-linecap="round"/>` +
  // the picture draws the route as two golden lines; the second runs just under the first
  `<path d="${ROUTE}" transform="translate(-10 22)" fill="none" stroke="#fff" stroke-width="44" stroke-linecap="round"/>` +
  `<circle cx="302" cy="772" r="58" fill="#fff"/></svg>`))
  .blur(4).greyscale().raw().toBuffer();

const { data, info } = await sharp(path.join(HERE, "source.webp")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
for (let i = 0, p = 0; p < N * N; p++, i += info.channels) {
  const m = band[p] / 255;
  if (m <= 0) continue;
  const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
  const warm = smooth(0.0, 0.14, (r + g) / 2 - b) * smooth(0.2, 0.38, r);
  const k = m * warm;
  if (k <= 0) continue;
  const L = 0.299 * r + 0.587 * g + 0.114 * b;
  const hot = Math.max(L - 0.82, 0) * 2.2; // the white-hot core of the glow stays white
  const red = [0.86 * (0.35 + L * 1.25) + hot, 0.11 * (0.35 + L * 1.25) + hot, 0.16 * (0.35 + L * 1.25) + hot];
  for (let c = 0; c < 3; c++) data[i + c] = Math.round(255 * Math.min(1, (1 - k) * [r, g, b][c] + k * red[c]));
}
await sharp(data, { raw: { width: N, height: N, channels: info.channels } }).webp({ quality: 86 }).toFile(path.join(ROOT, "public/brand/hero-art.webp"));
console.log("baked public/brand/hero-art.webp");
