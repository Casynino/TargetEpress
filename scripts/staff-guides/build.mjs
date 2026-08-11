/**
 * Build the staff guides.
 *
 *   node scripts/staff-guides/build.mjs            # all departments
 *   node scripts/staff-guides/build.mjs finance    # just one
 *
 * Renders each department's content through the shared template, then prints it
 * with headless Chrome. Chrome is used rather than a PDF library because the
 * guides are typeset with real CSS — and because it embeds the fonts, so the
 * file looks identical on a machine that has never heard of Avenir Next.
 */

import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { renderGuide } from "./template.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "docs", "staff-guides");

const DEPARTMENTS = ["finance", "support", "china-warehouse", "dar-warehouse", "admin"];

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

// Outside the repo, and thrown away between runs: a profile left behind by a
// killed Chrome makes the next launch hang instead of printing.
const PROFILE = join(tmpdir(), "tx-staff-guides-chrome");

/**
 * Print one HTML file to PDF.
 *
 * Chrome writes the PDF and then lingers instead of exiting, so waiting on the
 * process itself hangs forever. Poll for the file, give it a moment to flush,
 * then close Chrome ourselves.
 */
async function printToPdf(htmlPath, pdfPath) {
  // Clear the previous PDF first. Otherwise the poll below sees last run's file
  // immediately, reports success, and leaves Chrome running behind it.
  await rm(pdfPath, { force: true });

  return new Promise((resolve, reject) => {
    const child = spawn(
      CHROME,
      [
        "--headless",
        "--disable-gpu",
        "--no-sandbox",
        "--no-first-run",
        "--disable-extensions",
        `--user-data-dir=${PROFILE}`,
        "--no-pdf-header-footer",
        "--virtual-time-budget=10000",
        `--print-to-pdf=${pdfPath}`,
        // Must be a real file URL: this project's path contains a space, and an
        // unescaped one makes Chrome sit there forever without ever printing.
        pathToFileURL(htmlPath).href,
      ],
      // Detached so Chrome gets its own process group; it spawns helpers that
      // outlive the parent, and killing the group is the only way to be sure
      // nothing is left holding the terminal open.
      { stdio: "ignore", detached: true }
    );

    const stop = () => {
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        /* already gone */
      }
    };

    const started = Date.now();
    const tick = setInterval(() => {
      if (existsSync(pdfPath)) {
        clearInterval(tick);
        // Let Chrome finish flushing the file before taking it down.
        setTimeout(() => {
          stop();
          resolve();
        }, 1500);
      } else if (Date.now() - started > 90_000) {
        clearInterval(tick);
        stop();
        reject(new Error(`Chrome produced no PDF for ${htmlPath}`));
      }
    }, 300);

    child.on("error", (err) => {
      clearInterval(tick);
      stop();
      reject(err);
    });
  });
}

/** Page count and sheet size, read straight back out of the PDF we just wrote. */
async function inspect(pdfPath) {
  const buf = await readFile(pdfPath);
  const raw = buf.toString("latin1");
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  const box = raw.match(/\/MediaBox\s*\[([^\]]+)\]/);
  let size = "unknown";
  if (box) {
    const [, , w, h] = box[1].trim().split(/\s+/).map(Number);
    size = `${Math.round((w / 72) * 25.4)}x${Math.round((h / 72) * 25.4)}mm`;
  }
  return { pages, size, kb: Math.round(buf.length / 1024) };
}

const wanted = process.argv.slice(2);
const targets = wanted.length ? wanted : DEPARTMENTS;

await mkdir(OUT, { recursive: true });
await rm(PROFILE, { recursive: true, force: true });

for (const slug of targets) {
  const { default: dept } = await import(`./content/${slug}.mjs`);
  const htmlPath = join(OUT, `${slug}.html`);
  const pdfPath = join(OUT, `${slug}.pdf`);

  await writeFile(htmlPath, renderGuide(dept), "utf8");
  await printToPdf(htmlPath, pdfPath);

  const { pages, size, kb } = await inspect(pdfPath);
  // cover + authorities + map + guardrails + closing, plus one page per step
  // and the two optional reference pages.
  const expected =
    5 + dept.steps.length + (dept.mistakes?.length ? 1 : 0) + (dept.menu?.rows?.length ? 1 : 0);
  const flag = pages === expected ? "" : `  <-- expected ${expected}`;
  console.log(`${slug.padEnd(16)} ${String(pages).padStart(2)} pages  ${size}  ${String(kb).padStart(4)}KB${flag}`);
}
