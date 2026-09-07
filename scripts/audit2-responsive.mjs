/**
 * DOES ANY PAGE PUSH ITSELF OFF THE SIDE OF A PHONE — IN EITHER LANGUAGE.
 *
 *   node scripts/audit2-responsive.mjs
 *
 * The failure this catches is the one the owner reports as "zoomed" or "cut
 * off": horizontal overflow. The page technically shrinks, but something
 * inside it is wider than the screen, so the whole layout slides sideways and
 * the buttons on the right go where no thumb can reach.
 *
 * Measured, not eyeballed: scrollWidth against the viewport, plus the widest
 * element responsible. Run at 320 (the smallest phone still in use), 375 and
 * 768, and in Chinese as well as English — a 30-character Chinese product name
 * does not wrap where an English one does.
 */
import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";
const BASE = process.env.BASE ?? "http://localhost:3177";
const PASS = process.env.SEED_ADMIN_PASSWORD ?? "";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prisma = new PrismaClient();

async function cookies(email) {
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  const c1 = r1.headers.getSetCookie();
  const { csrfToken } = await r1.json();
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: c1.map((c) => c.split(";")[0]).join("; ") },
    body: new URLSearchParams({ csrfToken, email, password: PASS, redirect: "false" }),
  });
  return [...c1, ...r2.headers.getSetCookie()].map((c) => { const p = c.split(";")[0]; const i = p.indexOf("="); return { name: p.slice(0, i), value: p.slice(i + 1), url: BASE }; }).filter((c) => c.name && c.value);
}

const shipment = await prisma.shipment.findFirst({ where: { deletedAt: null }, select: { id: true } });
const invoice = await prisma.invoice.findFirst({ select: { id: true } });
const batch = await prisma.batch.findFirst({ select: { id: true } });
const customer = await prisma.customer.findFirst({ select: { id: true } });

/* The screens staff actually hold a phone in front of, plus the dense money
   pages where a table is most likely to escape. */
const PAGES = [
  ["ceo", "/app/dashboard"],
  ["ceo", "/app/reports"],
  ["ceo", "/app/admin/users"],
  ["ceo", "/app/admin/audit"],
  ["manager", "/app/manager"],
  ["manager", "/app/manager/reconciliation"],
  ["manager", "/app/manager/approvals"],
  ["manager", "/app/manager/reports"],
  ["finance", "/app/finance"],
  ["finance", "/app/finance/verify"],
  ["finance", "/app/finance/invoices"],
  ["finance", "/app/finance/payments/new"],
  ["finance", "/app/finance/transactions"],
  ["finance", "/app/finance/expenses"],
  ["finance", "/app/finance/reports"],
  ["finance", "/app/finance/batches"],
  ["finance", "/app/collections/pending"],
  ["finance", "/app/collections/submissions"],
  ["finance", invoice ? `/app/finance/invoices/${invoice.id}` : null],
  ["finance", invoice ? `/app/collections/record/${invoice.id}` : null],
  ["warehouse", "/app/receive"],
  ["warehouse", "/app/release"],
  ["warehouse", "/app/pickup-queue"],
  ["warehouse", "/app/scan"],
  ["warehouse", "/app/exceptions"],
  ["warehouse", "/app/deliveries"],
  ["warehouse", batch ? `/app/receive/${batch.id}` : null],
  ["warehouse", shipment ? `/app/cargo/${shipment.id}` : null],
  ["china", "/app/incoming"],
  ["china", "/app/inventory"],
  ["china", "/app/cargo/new"],
  ["china", "/app/batches"],
  ["china", batch ? `/app/batches/${batch.id}` : null],
  ["support", "/app/support"],
  ["support", "/app/search"],
  ["support", "/app/customers"],
  ["support", "/app/requests"],
  ["support", customer ? `/app/customers/${customer.id}` : null],
].filter(([, url]) => url);

const WIDTHS = [320, 375, 768];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const bad = [];
let checked = 0;

/* The reading language lives on the user, not in a cookie — so the Chinese
   pass flips every test account to zh and puts it back afterwards. */
const EMAILS = [...new Set(PAGES.map(([who]) => `${who}@targetexpress.co.tz`))];
const before = await prisma.user.findMany({ where: { email: { in: EMAILS } }, select: { id: true, email: true, preferredLanguage: true } });

for (const locale of ["en", "zh"]) {
  await prisma.user.updateMany({ where: { email: { in: EMAILS } }, data: { preferredLanguage: locale } });
  for (const [who, url] of PAGES) {
    const page = await browser.newPage();
    const jar = await cookies(`${who}@targetexpress.co.tz`);
    await page.setCookie(...jar);
    for (const width of WIDTHS) {
      await page.setViewport({ width, height: 812, deviceScaleFactor: 2 });
      try {
        await page.goto(BASE + url, { waitUntil: "networkidle2", timeout: 60_000 });
      } catch { continue; }
      await new Promise((r) => setTimeout(r, 250));
      const result = await page.evaluate((w) => {
        const doc = document.documentElement;
        const over = doc.scrollWidth - w;
        if (over <= 1) return { over: 0, culprits: [] };
        /* Name the element actually sticking out, not its parents: the widest
           node whose own box crosses the viewport edge and whose parent does
           not already. */
        const culprits = [];
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.right <= w + 1) continue;
          const p = el.parentElement;
          if (p && p.getBoundingClientRect().right > w + 1) continue;
          culprits.push(`${el.tagName.toLowerCase()}.${(el.className && typeof el.className === "string" ? el.className : "").split(" ").filter(Boolean).slice(0, 4).join(".")} right=${Math.round(r.right)}`);
          if (culprits.length >= 3) break;
        }
        return { over, culprits };
      }, width);
      checked += 1;
      if (result.over > 1) {
        bad.push({ locale, who, url, width, over: result.over, culprits: result.culprits });
        console.log(`  ✗ [${locale}] ${url} @${width} overflows by ${result.over}px — ${result.culprits.join(" | ") || "(no single culprit)"}`);
      }
    }
    await page.close();
  }
}

for (const u of before) await prisma.user.update({ where: { id: u.id }, data: { preferredLanguage: u.preferredLanguage } });

console.log(`\n${checked} page renders measured (${PAGES.length} pages × ${WIDTHS.length} widths × 2 languages).`);
console.log(bad.length === 0 ? "Nothing overflows the screen." : `${bad.length} overflow(s) above.`);
await browser.close();
await prisma.$disconnect();
process.exit(bad.length === 0 ? 0 : 1);
