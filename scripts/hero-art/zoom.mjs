// Working tool: a magnified piece of the source picture with a labelled grid, for tracing outlines by eye.
//   node scripts/hero-art/zoom.mjs x y w h scale out.png [file]
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
const require = createRequire(import.meta.url);
const sharp = require("sharp");
const HERE = path.dirname(fileURLToPath(import.meta.url));
const [x, y, w, h, s, out, file = path.join(HERE, "source.webp"), step = "10"] = process.argv.slice(2);
const [X, Y, Wd, Hd, S, ST] = [x, y, w, h, s, step].map(Number);
const img = await sharp(file).extract({ left: X, top: Y, width: Wd, height: Hd }).resize(Wd * S, Hd * S, { kernel: "cubic" }).png().toBuffer();
const L = [];
for (let v = Math.ceil(X / ST) * ST; v <= X + Wd; v += ST) { const major = v % (ST * 5) === 0; L.push(`<line x1="${(v - X) * S}" y1="0" x2="${(v - X) * S}" y2="${Hd * S}" stroke="${major ? "rgba(255,60,60,0.75)" : "rgba(255,255,255,0.22)"}" stroke-width="1"/>`); if (major) L.push(`<text x="${(v - X) * S + 2}" y="11" fill="#ff0" font-size="11" font-family="Arial">${v}</text>`); }
for (let v = Math.ceil(Y / ST) * ST; v <= Y + Hd; v += ST) { const major = v % (ST * 5) === 0; L.push(`<line x1="0" y1="${(v - Y) * S}" x2="${Wd * S}" y2="${(v - Y) * S}" stroke="${major ? "rgba(255,60,60,0.75)" : "rgba(255,255,255,0.22)"}" stroke-width="1"/>`); if (major) L.push(`<text x="2" y="${(v - Y) * S - 2}" fill="#ff0" font-size="11" font-family="Arial">${v}</text>`); }
await sharp(img).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${Wd * S}" height="${Hd * S}">${L.join("")}</svg>`), left: 0, top: 0 }]).png().toFile(out);
