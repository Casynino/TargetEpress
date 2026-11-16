// Renders the homepage hero film from scene.html (see that file for what it shows).
//
//   node scripts/hero-film/render.mjs --preview landscape [--t 3]   one frame, to look at
//   node scripts/hero-film/render.mjs --loop landscape              the whole loop, encoded
//   node scripts/hero-film/render.mjs --loop portrait
//
// Writes public/brand/film/hero-<orientation>.webp (the film, an animated WebP
// as on the ZELab sign-in) and hero-<orientation>-poster.webp (its first frame).
// Everything happens on this computer: the page imports three.js from a CDN
// only while rendering, and the site itself only plays the finished film.
import { createServer } from "node:http";
import { readFile, mkdir, writeFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const sharp = require("sharp");

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HERE = path.join(ROOT, "scripts/hero-film");
const OUT = path.join(ROOT, "public/brand/film");

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const orient = flag("--preview") ?? flag("--loop");
if (!["landscape", "portrait"].includes(orient)) {
  console.error("usage: --preview|--loop landscape|portrait [--t seconds] [--frames 240]");
  process.exit(1);
}
const preview = args.includes("--preview");
const FRAMES = Number(flag("--frames") ?? 240);
const LOOP = 24;

// The logo as a PNG the scene can paint onto the aircraft.
const logoPng = await sharp(path.join(ROOT, "public/brand/target-express-logo.svg"), { density: 300 }).resize(1200).png().toBuffer();

const server = createServer(async (req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  try {
    if (url === "/" || url === "/scene.html") { res.writeHead(200, { "content-type": "text/html" }); return res.end(await readFile(path.join(HERE, "scene.html"))); }
    if (url === "/geo/land-110m.json") { res.writeHead(200, { "content-type": "application/json" }); return res.end(await readFile(path.join(ROOT, "public/geo/land-110m.json"))); }
    if (url === "/brand/target-express-logo.png") { res.writeHead(200, { "content-type": "image/png" }); return res.end(logoPng); }
    res.writeHead(404); res.end();
  } catch { res.writeHead(500); res.end(); }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: "new",
  args: ["--no-sandbox", "--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
const [W, H] = orient === "portrait" ? [780, 1560] : [1600, 900];
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
page.on("console", (m) => m.type() === "error" && console.log("scene:", m.text()));
page.on("pageerror", (e) => console.log("scene error:", e.message));
await page.goto(`http://127.0.0.1:${port}/scene.html?o=${orient}`, { waitUntil: "networkidle0", timeout: 120000 });
await page.waitForFunction(() => window.ready === true, { timeout: 120000 });

const grab = async (t) => {
  const dataUrl = await page.evaluate((tt) => { window.renderAt(tt); return document.querySelector("canvas").toDataURL("image/png"); }, t);
  return Buffer.from(dataUrl.split(",")[1], "base64");
};

await mkdir(OUT, { recursive: true });
if (preview) {
  const t = Number(flag("--t") ?? 3);
  const file = path.join(os.tmpdir(), `hero-film-${orient}.png`);
  await writeFile(file, await grab(t));
  console.log("preview", file);
} else {
  const dir = path.join(os.tmpdir(), `hero-film-frames-${orient}`);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  const started = Date.now();
  for (let i = 0; i < FRAMES; i++) {
    await writeFile(path.join(dir, `f${String(i).padStart(4, "0")}.png`), await grab((i / FRAMES) * LOOP));
    if (i % 40 === 0) console.log(`frame ${i}/${FRAMES} (${Math.round((Date.now() - started) / 1000)}s)`);
  }
  const film = path.join(OUT, `hero-${orient}.webp`);
  const poster = path.join(OUT, `hero-${orient}-poster.webp`);
  execFileSync("python3", [path.join(HERE, "encode.py"), dir, film, poster, String(Math.round((LOOP / FRAMES) * 1000))], { stdio: "inherit" });
}
await browser.close();
server.close();
