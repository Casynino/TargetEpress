/**
 * Walk every staff screen at phone and desktop width and report what is wrong.
 *
 *   node scripts/audit-pages.mjs                       # localhost:3210
 *   BASE=https://target-epress.vercel.app node scripts/audit-pages.mjs
 *   node scripts/audit-pages.mjs --shots               # also write PNGs
 *   node scripts/audit-pages.mjs --lang zh             # audit the Chinese side
 *
 * Checks each page for the things that actually break a warehouse phone:
 *
 *   horizontal overflow  the page scrolls sideways. The most common mobile
 *                        defect there is, and completely invisible on a desktop
 *   tap targets          clickable things under 44x44 — the size a thumb can
 *                        hit reliably while holding a box
 *   tiny text            under 12px, unreadable on a warehouse floor
 *   console errors       anything the browser complained about
 *   failed requests      4xx/5xx for data or assets
 *   thin pages           rendered but nearly empty, which usually means an
 *                        error boundary swallowed something
 *   untranslated text    Latin words on a page being read in Chinese
 *
 * Drives the Chrome already on the machine through puppeteer-core, so there is
 * no second browser to download and what it measures is what staff will see.
 */

import { mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE ?? "http://localhost:3210";
const EMAIL = process.env.AUDIT_EMAIL ?? "ceo@targetexpress.co.tz";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const SHOTS = process.argv.includes("--shots");
// indexOf returns -1 when a flag is absent, and -1 + 1 is 0 — which is the
// path to node. Read the flag only when it is actually there.
const flag = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const LANG = flag("lang") === "zh" ? "zh" : "en";
const ONLY = flag("route")?.startsWith("/") ? flag("route") : null;
const OUT = join(tmpdir(), "tx-audit");

const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const ROUTES = ONLY ? [ONLY] : [
  "/app/dashboard", "/app/search", "/app/requests", "/app/cargo/new",
  "/app/shipments", "/app/batches", "/app/customers", "/app/exceptions",
  "/app/reports", "/app/profile", "/app/notifications", "/app/inventory",
  "/app/receive", "/app/pickup-queue", "/app/deliveries", "/app/release",
  "/app/collections", "/app/collections/follow-up",
  "/app/finance", "/app/finance/verify", "/app/finance/payments",
  "/app/finance/pickup-notes", "/app/finance/accounts",
  "/app/finance/transactions", "/app/finance/expenses",
  "/app/finance/pricing", "/app/finance/audit", "/app/finance/reports",
  "/app/support", "/app/support/tickets", "/app/support/sourcing",
  "/app/support/markets",
  "/app/admin/users", "/app/admin/deleted", "/app/admin/settings",
  "/app/admin/audit", "/app/admin/markets",
];

const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, isMobile: true, deviceScaleFactor: 2 },
  { name: "desktop", width: 1440, height: 900, isMobile: false, deviceScaleFactor: 1 },
];

/** Signs in through the credentials endpoint and returns the cookie jar. */
async function sessionCookies() {
  if (!PASSWORD) throw new Error("SEED_ADMIN_PASSWORD is not set — put it in .env.");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const first = csrfRes.headers.getSetCookie?.() ?? [];
  const { csrfToken } = await csrfRes.json();

  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: first.map((c) => c.split(";")[0]).join("; "),
    },
    body: new URLSearchParams({
      csrfToken, email: EMAIL, password: PASSWORD, redirect: "false",
    }),
  });

  const all = [...first, ...(res.headers.getSetCookie?.() ?? [])];
  if (!all.some((c) => /session-token/.test(c))) {
    throw new Error("Sign-in returned no session cookie — check the password.");
  }
  /*
    Set by URL, not by domain.

    On HTTPS, Auth.js names its cookie `__Secure-authjs.session-token`, and the
    `__Secure-` prefix is only legal on a cookie marked secure. Handing CDP a
    domain and no `secure` makes it reject the ENTIRE batch with "Invalid
    cookie fields", which reads like a puppeteer bug and is not one. Giving it
    the URL lets Chrome derive the scheme, the host and the secure flag itself.
  */
  const secure = BASE.startsWith("https");
  return all
    .map((c) => {
      const pair = c.split(";")[0].trim();
      const i = pair.indexOf("=");
      if (i <= 0) return null;
      return {
        name: pair.slice(0, i),
        value: pair.slice(i + 1),
        url: BASE,
        secure: secure || pair.startsWith("__Secure-") || pair.startsWith("__Host-"),
      };
    })
    .filter((c) => c && c.name && c.value);
}

/** Everything measurable about how this page is laid out, from inside it. */
function probe() {
  const doc = document.documentElement;
  const overflow = Math.max(0, doc.scrollWidth - doc.clientWidth);

  const widest = [];
  for (const el of document.querySelectorAll("body *")) {
    if (el.scrollWidth <= el.clientWidth + 4) continue;
    const s = getComputedStyle(el);
    if (s.overflowX === "auto" || s.overflowX === "scroll") continue; // scrolls on purpose
    const cls = typeof el.className === "string" ? el.className.split(" ")[0] : "";
    widest.push(`${el.tagName.toLowerCase()}${cls ? "." + cls : ""} +${el.scrollWidth - el.clientWidth}px`);
    if (widest.length >= 5) break;
  }

  const taps = [];
  for (const el of document.querySelectorAll("a,button,[role=button],input,select,summary")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (getComputedStyle(el).display === "none") continue;
    if (r.height < 44 || r.width < 44) {
      const label = (el.textContent || el.getAttribute("aria-label") || el.tagName).trim();
      taps.push(`${label.slice(0, 32) || el.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    if (taps.length >= 8) break;
  }

  const tiny = [];
  for (const el of document.querySelectorAll("p,span,td,th,li,label,a,button,div")) {
    if (!el.firstChild || el.firstChild.nodeType !== 3) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px && px < 12) tiny.push(`${px}px "${(el.textContent || "").trim().slice(0, 32)}"`);
    if (tiny.length >= 5) break;
  }

  const text = (document.body.innerText || "").replace(/\s+/g, " ").trim();
  const latin = (text.match(/[A-Za-z][A-Za-z'-]{2,}/g) || []).length;
  const cjk = (text.match(/[一-鿿]/g) || []).length;

  return {
    overflow, widest, taps, tiny,
    chars: text.length, latin, cjk,
    broken: !!document.querySelector("[data-error], .error-boundary"),
    errorPage: /Something went wrong|Application error|404/.test(text.slice(0, 400)),
  };
}

await mkdir(OUT, { recursive: true });

console.log(`auditing ${BASE}  (reading in ${LANG})\n`);
const cookies = await sessionCookies();

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
});

const findings = [];

for (const vp of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewport(vp);
  if (vp.isMobile) {
    await page.setUserAgent(
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
      "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
    );
  }
  await page.setCookie(...cookies);

  const errors = [];
  const failed = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 160)}`));
  page.on("requestfailed", (r) => {
    const why = r.failure()?.errorText ?? "";
    // Next.js cancels in-flight RSC prefetches on navigation. Reporting those
    // as failures buried the real ones under twenty lines of noise per page.
    if (why === "net::ERR_ABORTED" && r.url().includes("_rsc=")) return;
    failed.push(`${why} ${r.url().slice(0, 90)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !r.url().includes("favicon")) failed.push(`${r.status()} ${r.url().slice(0, 90)}`);
  });

  console.log(`--- ${vp.name} ${vp.width}px ---`);
  for (const route of ROUTES) {
    errors.length = 0;
    failed.length = 0;
    let r;
    try {
      const res = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2", timeout: 45_000 });
      await new Promise((ok) => setTimeout(ok, 350)); // let charts settle
      r = await page.evaluate(probe);
      if (res && res.status() >= 400) r.httpStatus = res.status();
    } catch (e) {
      findings.push({ vp: vp.name, route, issues: [`navigation failed: ${String(e).slice(0, 90)}`] });
      console.log(`  ${route.padEnd(32)} NAVIGATION FAILED`);
      continue;
    }

    if (SHOTS) {
      await page.screenshot({ path: join(OUT, `${vp.name}${route.replace(/\//g, "_")}.png`) });
    }

    const issues = [];
    if (r.errorPage) issues.push("ERROR PAGE");
    if (r.httpStatus) issues.push(`HTTP ${r.httpStatus}`);
    if (r.overflow > 2) issues.push(`scrolls sideways +${r.overflow}px${r.widest.length ? " (" + r.widest[0] + ")" : ""}`);
    if (vp.isMobile && r.taps.length) issues.push(`${r.taps.length} small tap target(s): ${r.taps[0]}`);
    if (r.tiny.length) issues.push(`${r.tiny.length} tiny text: ${r.tiny[0]}`);
    if (r.chars < 120) issues.push(`nearly empty (${r.chars} chars)`);
    if (errors.length) issues.push(`${errors.length} console error(s): ${errors[0]}`);
    if (failed.length) issues.push(`${failed.length} failed request(s): ${failed[0]}`);
    if (LANG === "zh" && r.latin > 25 && r.cjk > 0) issues.push(`${r.latin} English words remain`);

    if (issues.length) {
      findings.push({ vp: vp.name, route, issues, detail: { taps: r.taps, tiny: r.tiny, widest: r.widest, errors, failed } });
      console.log(`  ${route.padEnd(32)} ${issues.join(" | ")}`);
    } else {
      console.log(`  ${route.padEnd(32)} ok`);
    }
  }
  console.log();
  await page.close();
}

await browser.close();
await writeFile(join(OUT, `findings-${LANG}.json`), JSON.stringify(findings, null, 1));
console.log(`${findings.length} finding(s). Written to ${join(OUT, `findings-${LANG}.json`)}`);
if (SHOTS) console.log(`screenshots in ${OUT}`);
