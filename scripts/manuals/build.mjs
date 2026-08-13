/**
 * Build the department training manuals.
 *
 *   node scripts/manuals/build.mjs                  # all departments
 *   node scripts/manuals/build.mjs china-warehouse  # one
 *
 * Screenshots must exist first — run scripts/manuals/capture.mjs against a
 * running server. The HTML references them relatively, so the PDF is printed
 * from inside docs/manuals and Chrome resolves them off disk.
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { renderManual } from "./template.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "docs", "manuals");

const DEPARTMENTS = ["china-warehouse", "dar-warehouse", "finance", "support", "admin"];

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Outside the repo and thrown away each run: a profile left behind by a killed
// Chrome makes the next launch hang rather than print.
const PROFILE = join(tmpdir(), "tx-manuals-chrome");

async function printToPdf(htmlPath, pdfPath) {
  await rm(pdfPath, { force: true });
  return new Promise((resolve, reject) => {
    const child = spawn(
      CHROME,
      [
        "--headless", "--disable-gpu", "--no-sandbox", "--no-first-run",
        "--disable-extensions",
        `--user-data-dir=${PROFILE}`,
        "--no-pdf-header-footer",
        // Generous: a manual carries 30-odd full-page screenshots and Chrome
        // has to decode every one before it can lay the first page out.
        "--virtual-time-budget=60000",
        `--print-to-pdf=${pdfPath}`,
        pathToFileURL(htmlPath).href,
      ],
      { stdio: "ignore", detached: true }
    );
    const stop = () => {
      try { process.kill(-child.pid, "SIGKILL"); } catch {}
    };
    const started = Date.now();
    const tick = setInterval(() => {
      if (existsSync(pdfPath)) {
        clearInterval(tick);
        setTimeout(() => { stop(); resolve(); }, 2500);
      } else if (Date.now() - started > 180_000) {
        clearInterval(tick);
        stop();
        reject(new Error(`Chrome produced no PDF for ${htmlPath}`));
      }
    }, 400);
    child.on("error", (e) => { clearInterval(tick); stop(); reject(e); });
  });
}

async function inspect(pdfPath) {
  const buf = await readFile(pdfPath);
  const raw = buf.toString("latin1");
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const box = raw.match(/\/MediaBox\s*\[([^\]]+)\]/);
  let size = "?";
  if (box) {
    const [, , w, h] = box[1].trim().split(/\s+/).map(Number);
    size = `${Math.round((w / 72) * 25.4)}x${Math.round((h / 72) * 25.4)}mm`;
  }
  return { pages, size, mb: (buf.length / 1024 / 1024).toFixed(1) };
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const targets = wanted.length ? wanted : DEPARTMENTS;

await mkdir(OUT, { recursive: true });
await rm(PROFILE, { recursive: true, force: true });

for (const slug of targets) {
  const { default: manual } = await import(`./content/${slug}.mjs`);
  const htmlPath = join(OUT, `${slug}.html`);
  const pdfPath = join(OUT, `${slug}-manual.pdf`);

  await writeFile(htmlPath, renderManual(manual, `shots/${slug}`), "utf8");
  await printToPdf(htmlPath, pdfPath);

  const { pages, size, mb } = await inspect(pdfPath);
  console.log(`${slug.padEnd(17)} ${String(pages).padStart(3)} pages  ${size}  ${mb}MB`);
}
