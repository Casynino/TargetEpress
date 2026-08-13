/**
 * List the English still showing on a screen being read in Chinese.
 *
 *   node scripts/audit-zh-strings.mjs            # admin + china warehouse
 *   node scripts/audit-zh-strings.mjs admin
 *
 * audit-pages.mjs counts Latin words per page, which is enough to know a screen
 * is wrong and useless for fixing it. This prints the actual strings, so each
 * one can be traced to the component that produced it.
 *
 * Runs against the working database: the account is switched into Chinese for
 * the walk and put back afterwards, the same way capture.mjs does it.
 */

import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3210";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const DESKS = {
  admin: {
    email: "ceo@targetexpress.co.tz",
    screens: [
      "/app/dashboard", "/app/finance", "/app/finance/reports", "/app/exceptions",
      "/app/admin/users", "/app/admin/deleted", "/app/admin/settings",
      "/app/admin/audit", "/app/admin/markets", "/app/finance/pricing",
      "/app/batches", "/app/shipments",
    ],
  },
  "china-warehouse": {
    email: "china@targetexpress.co.tz",
    screens: [
      "/app/dashboard", "/app/search", "/app/requests", "/app/cargo/new",
      "/app/batches", "/app/shipments", "/app/customers", "/app/exceptions",
      "/app/reports", "/app/profile",
    ],
  },
};

/*
  Latin that BELONGS on a Chinese screen.

  A Chinese manual is not one with every Roman letter scrubbed out of it. The
  brand is a brand, a tracking number is an identifier, and a customer in Dar
  is called John whichever language you read. Flagging these would bury the
  real findings under noise nobody will read twice.
*/
const KEEP = [
  /^[\s\d.,:/+%-]*$/,                       // numerals and punctuation alone
  /^(Target|Express|Target Express)$/i,
  /^(USD|TSh|CNY|RMB|kg|KG|QR|PDF|ID|OK|CEO|Admin)$/,
  /^TX-\d+/, /^[A-Z]{2}\/\d{2}-\d+$/,       // tracking and batch codes
  /^\/app\//,                                // route paths
  /@|https?:|\.co\.tz|vercel\.app/,          // emails and URLs
  /^(English|中文)$/,                         // the language switch names itself
];

const latinRun = /[A-Za-z][A-Za-z'’-]*(?:\s+[A-Za-z][A-Za-z'’-]*)*/g;

async function cookies(email) {
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
  if (!all.some((c) => /session-token/.test(c))) throw new Error(`sign-in failed: ${email}`);
  return all
    .map((c) => {
      const p = c.split(";")[0].trim();
      const i = p.indexOf("=");
      return i > 0 ? { name: p.slice(0, i), value: p.slice(i + 1), url: BASE } : null;
    })
    .filter(Boolean);
}

if (!PASSWORD) throw new Error("SEED_ADMIN_PASSWORD is not set.");

const prisma = new PrismaClient();
const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const targets = wanted.length ? wanted : Object.keys(DESKS);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
});

const found = new Map(); // english string -> Set(screens)

for (const desk of targets) {
  const cfg = DESKS[desk];
  const before = await prisma.user.findUnique({
    where: { email: cfg.email },
    select: { preferredLanguage: true },
  });
  await prisma.user.update({
    where: { email: cfg.email },
    data: { preferredLanguage: "zh" },
  });

  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setCookie(...(await cookies(cfg.email)));

  for (const route of cfg.screens) {
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "networkidle2", timeout: 45_000 });
      await new Promise((r) => setTimeout(r, 500));
      // Leaf elements only: taking every ancestor's textContent would report the
      // same sentence once per level of the tree.
      const texts = await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .filter((el) => !el.children.length && el.offsetParent !== null)
          .map((el) => (el.textContent ?? "").trim())
          .filter(Boolean),
      );
      for (const t of texts) {
        for (const run of t.match(latinRun) ?? []) {
          const s = run.trim();
          if (s.length < 3) continue;
          if (KEEP.some((re) => re.test(s))) continue;
          if (KEEP.some((re) => re.test(t.trim()))) continue;
          if (!found.has(s)) found.set(s, new Set());
          found.get(s).add(`${desk}${route}`);
        }
      }
    } catch (e) {
      console.error(`  FAILED ${desk}${route}: ${String(e).slice(0, 70)}`);
    }
  }

  await ctx.close();
  await prisma.user.update({
    where: { email: cfg.email },
    data: { preferredLanguage: before?.preferredLanguage ?? "en" },
  });
}

await browser.close();
await prisma.$disconnect();

const rows = [...found.entries()].sort((a, b) => b[1].size - a[1].size);
console.log(`\n${rows.length} English strings still showing in Chinese mode\n`);
for (const [s, where] of rows) {
  console.log(`  ${JSON.stringify(s)}`);
  console.log(`      ${[...where].slice(0, 4).join("  ")}${where.size > 4 ? ` +${where.size - 4}` : ""}`);
}
