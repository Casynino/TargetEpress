/**
 * Photograph the real system, once per department, for the training manuals.
 *
 *   node scripts/manuals/capture.mjs                 # every department
 *   node scripts/manuals/capture.mjs china-warehouse # just one
 *
 * Signs in as each role and screenshots every screen THAT ROLE can reach, so a
 * manual shows the reader their own system rather than the CEO's. A Dar clerk
 * opening the Finance page in a manual and never seeing it in life is worse
 * than no picture at all.
 *
 * Two shots per screen:
 *   full   the whole page, for the chapter that explains the screen
 *   hero   the first 900px, for a figure that has to sit inside a page
 *
 * Deliberately captures against the seeded production data — 79 real
 * consignments off two real manifests — because a manual full of empty states
 * teaches nobody what a working screen looks like.
 */

import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "docs", "manuals", "shots");

const BASE = process.env.BASE ?? "http://localhost:3210";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** Each department, the account it signs in with, and the screens it owns. */
export const DEPARTMENTS = {
  "china-warehouse": {
    email: "china@targetexpress.co.tz",
    locale: "zh",
    screens: [
      ["home", "/app/dashboard"],
      ["search", "/app/search"],
      ["requests", "/app/requests"],
      ["receive-cargo", "/app/cargo/new"],
      ["batches", "/app/batches"],
      ["shipments", "/app/shipments"],
      ["customers", "/app/customers"],
      ["issues", "/app/exceptions"],
      ["reports", "/app/reports"],
      ["profile", "/app/profile"],
    ],
  },
  "dar-warehouse": {
    email: "warehouse@targetexpress.co.tz",
    locale: "en",
    screens: [
      ["home", "/app/dashboard"],
      ["search", "/app/search"],
      ["scan-release", "/app/release"],
      ["pickup-queue", "/app/pickup-queue"],
      ["receiving-dock", "/app/receive"],
      ["available-cargo", "/app/inventory"],
      ["collected-cargo", "/app/deliveries"],
      ["issues", "/app/exceptions"],
      ["reports", "/app/reports"],
      ["profile", "/app/profile"],
    ],
  },
  finance: {
    email: "finance@targetexpress.co.tz",
    locale: "en",
    screens: [
      ["home", "/app/dashboard"],
      ["general-ledger", "/app/finance"],
      ["verify-payments", "/app/finance/verify"],
      ["payments", "/app/finance/payments"],
      ["pickup-notes", "/app/finance/pickup-notes"],
      ["collections", "/app/collections"],
      ["accounts", "/app/finance/accounts"],
      ["transactions", "/app/finance/transactions"],
      ["expenses", "/app/finance/expenses"],
      ["pricing", "/app/finance/pricing"],
      ["audit", "/app/finance/audit"],
      ["shipments", "/app/shipments"],
    ],
  },
  support: {
    email: "support@targetexpress.co.tz",
    locale: "en",
    screens: [
      ["home", "/app/support"],
      ["search", "/app/search"],
      ["customers", "/app/customers"],
      ["collections", "/app/collections"],
      ["follow-up", "/app/collections/follow-up"],
      ["pickup-notes", "/app/finance/pickup-notes"],
      ["tickets", "/app/support/tickets"],
      ["sourcing", "/app/support/sourcing"],
      ["markets", "/app/support/markets"],
      ["issues", "/app/exceptions"],
      ["shipments", "/app/shipments"],
    ],
  },
  admin: {
    email: "ceo@targetexpress.co.tz",
    locale: "en",
    screens: [
      ["home", "/app/dashboard"],
      ["general-ledger", "/app/finance"],
      ["reports", "/app/finance/reports"],
      ["issues", "/app/exceptions"],
      ["staff", "/app/admin/users"],
      ["deleted", "/app/admin/deleted"],
      ["settings", "/app/admin/settings"],
      ["audit", "/app/admin/audit"],
      ["markets", "/app/admin/markets"],
      ["pricing", "/app/finance/pricing"],
      ["batches", "/app/batches"],
      ["shipments", "/app/shipments"],
    ],
  },
};

/** The login screen itself, shot signed-out. Every manual opens with it. */
const PUBLIC_SHOTS = [["login", "/login"]];

async function sessionCookies(email) {
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  const first = r1.headers.getSetCookie?.() ?? [];
  const { csrfToken } = await r1.json();
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: first.map((c) => c.split(";")[0]).join("; "),
    },
    body: new URLSearchParams({ csrfToken, email, password: PASSWORD, redirect: "false" }),
  });
  const all = [...first, ...(r2.headers.getSetCookie?.() ?? [])];
  if (!all.some((c) => /session-token/.test(c))) {
    throw new Error(`Could not sign in as ${email}.`);
  }
  return all
    .map((c) => {
      const pair = c.split(";")[0].trim();
      const i = pair.indexOf("=");
      return i > 0
        ? { name: pair.slice(0, i), value: pair.slice(i + 1), url: BASE }
        : null;
    })
    .filter(Boolean);
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const targets = wanted.length ? wanted : Object.keys(DEPARTMENTS);

if (!PASSWORD) throw new Error("SEED_ADMIN_PASSWORD is not set.");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--force-color-profile=srgb"],
});

const manifest = {};

for (const dept of targets) {
  const cfg = DEPARTMENTS[dept];
  if (!cfg) throw new Error(`Unknown department: ${dept}`);

  const dir = join(OUT, dept);
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });

  const page = await browser.newPage();
  // 1280 wide: a real desktop, and narrow enough that text stays legible when
  // the shot is scaled down to fit inside an A4 column.
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });

  // The login page, before there is a session to speak of.
  for (const [name, route] of PUBLIC_SHOTS) {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2", timeout: 45_000 });
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: join(dir, `${name}.png`) });
  }

  await page.setCookie(...(await sessionCookies(cfg.email)));

  const shots = [];
  for (const [name, route] of cfg.screens) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2", timeout: 45_000 });
      await new Promise((r) => setTimeout(r, 600)); // charts and counters settle
      await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
      await page.screenshot({
        path: join(dir, `${name}-hero.png`),
        clip: { x: 0, y: 0, width: 1280, height: 900 },
      });
      const title = await page.evaluate(
        () => document.querySelector("h1")?.textContent?.trim() ?? ""
      );
      shots.push({ name, route, title });
      console.log(`  ${dept.padEnd(16)} ${name.padEnd(18)} ${route}`);
    } catch (e) {
      console.log(`  ${dept.padEnd(16)} ${name.padEnd(18)} FAILED ${String(e).slice(0, 60)}`);
    }
  }
  manifest[dept] = { email: cfg.email, locale: cfg.locale, shots };
  await page.close();
}

await browser.close();
await writeFile(join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
console.log(`\nScreenshots in ${OUT}`);
