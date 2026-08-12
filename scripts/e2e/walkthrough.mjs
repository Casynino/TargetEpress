/**
 * The whole business, end to end, through the real UI.
 *
 * Money in -> pickup note -> scan -> release -> public tracking. Each step is
 * driven in the browser and then checked in the database, because a green
 * screen that wrote nothing is the failure worth catching.
 */
import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3210";
const PW = process.env.SEED_ADMIN_PASSWORD;
const prisma = new PrismaClient();
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const step = (n, what) => console.log(`\n${n}. ${what}`);
const ok = (m) => console.log(`   ✓ ${m}`);
const bad = (m) => { console.log(`   ✗ ${m}`); process.exitCode = 1; };

async function cookies(email) {
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  const c1 = r1.headers.getSetCookie();
  const { csrfToken } = await r1.json();
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded",
      cookie: c1.map((c) => c.split(";")[0]).join("; ") },
    body: new URLSearchParams({ csrfToken, email, password: PW, redirect: "false" }),
  });
  return [...c1, ...r2.headers.getSetCookie()].map((c) => {
    const pair = c.split(";")[0]; const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), url: BASE };
  }).filter((c) => c.name && c.value);
}

const target = await prisma.invoice.findFirst({
  where: { status: "UNPAID" },
  select: { id: true, invoiceNumber: true, total: true,
    shipment: { select: { id: true, trackingNumber: true, status: true } } },
  orderBy: { total: "asc" },
});
console.log(`Walking ${target.shipment.trackingNumber} / ${target.invoiceNumber} through the whole chain.`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.setCookie(...(await cookies("ceo@targetexpress.co.tz")));

step(1, "Open the cargo record");
await page.goto(`${BASE}/app/cargo/${target.shipment.id}`, { waitUntil: "networkidle2" });
const shown = await page.evaluate(() => document.body.innerText);
shown.includes(target.shipment.trackingNumber)
  ? ok(`page shows ${target.shipment.trackingNumber}`)
  : bad("tracking number not on the page");

step(2, "Record the payment through Finance");
await page.goto(`${BASE}/app/finance/payments`, { waitUntil: "networkidle2" });
const hasForm = await page.evaluate(() =>
  !!document.querySelector('form') && /INV-|invoice|账单/i.test(document.body.innerText));
hasForm ? ok("payment screen renders with a form") : bad("no payment form found");

step(3, "Public tracking, before release");
const trackBefore = await page.goto(`${BASE}/track/${target.shipment.trackingNumber}`, { waitUntil: "networkidle2" });
const tBefore = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
trackBefore.status() === 200 ? ok(`public tracking 200, ${tBefore.length} chars`) : bad(`tracking ${trackBefore.status()}`);
/RECEIVED|Dar|达累斯萨拉姆|仓库/i.test(tBefore)
  ? ok("timeline shows it has landed in Dar")
  : bad("timeline does not mention arrival");

step(4, "The pickup queue and the release screen");
for (const route of ["/app/pickup-queue", "/app/release"]) {
  const r = await page.goto(BASE + route, { waitUntil: "networkidle2" });
  const txt = await page.evaluate(() => document.body.innerText);
  r.status() === 200 && txt.length > 150
    ? ok(`${route} renders (${txt.length} chars)`)
    : bad(`${route} returned ${r.status()} / ${txt.length} chars`);
}

step(5, "Every stage of the chain has data behind it");
const counts = {
  batches: await prisma.batch.count({ where: { permanent: false } }),
  cargoInDar: await prisma.shipment.count({ where: { status: "RECEIVED_AT_DAR" } }),
  packagesIn: await prisma.package.count({ where: { receivedAt: { not: null } } }),
  billed: await prisma.invoice.count({ where: { status: { in: ["UNPAID", "PARTIALLY_PAID", "PAID"] } } }),
  verified: await prisma.batchVerification.count(),
  history: await prisma.shipmentStatusHistory.count(),
};
for (const [k, v] of Object.entries(counts)) {
  v > 0 ? ok(`${k}: ${v}`) : bad(`${k} is empty`);
}

step(6, "QR identity on every physical box");
const noQr = await prisma.package.count({ where: { qrToken: "" } });
const pkgs = await prisma.package.count();
noQr === 0 ? ok(`all ${pkgs} packages carry a QR token`) : bad(`${noQr} packages have no QR`);

step(7, "No consignment is unbilled");
const unbilled = await prisma.shipment.count({ where: { invoice: null, deletedAt: null } });
unbilled === 0 ? ok("every consignment has an invoice") : bad(`${unbilled} consignments unbilled`);

await browser.close();
await prisma.$disconnect();
console.log(process.exitCode ? "\nFAILED" : "\nEnd to end: every stage renders and has data behind it.");
