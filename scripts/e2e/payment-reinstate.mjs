/**
 * REINSTATING A CANCELLED PAYMENT PUTS BACK WHAT THE CANCELLATION TOOK.
 *
 *   node scripts/e2e/payment-reinstate.mjs RCT-2026-000100
 *
 * Cancelling a payment takes back the difference that was written off
 * alongside it — it has to, or a bill sits settled on a decision made against
 * money that has since been unwound. Putting the payment back has to put that
 * decision back too. It did not: the bill returned owing a remainder Finance
 * had already agreed not to collect, and its cargo stopped being releasable
 * over the last few shillings.
 */
import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";
const BASE = "http://localhost:3177";
const PW = process.env.SEED_ADMIN_PASSWORD;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prisma = new PrismaClient();
const ok = (m) => console.log(`   ✓ ${m}`);
const bad = (m) => { console.log(`   ✗ ${m}`); process.exitCode = 1; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function cookies(email) {
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  const c1 = r1.headers.getSetCookie();
  const { csrfToken } = await r1.json();
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: c1.map((c) => c.split(";")[0]).join("; ") },
    body: new URLSearchParams({ csrfToken, email, password: PW, redirect: "false" }) });
  return [...c1, ...r2.headers.getSetCookie()].map((c) => { const p = c.split(";")[0]; const i = p.indexOf("="); return { name: p.slice(0, i), value: p.slice(i + 1), url: BASE }; }).filter((c) => c.name && c.value);
}

const RCT = process.argv[2];
const pay = await prisma.payment.findFirst({
  where: RCT ? { receipt: { receiptNumber: RCT } } : { voidedAt: { not: null } },
  orderBy: RCT ? undefined : { paidAt: "desc" },
  select: {
    id: true, voidedAt: true, receipt: { select: { receiptNumber: true } },
    allocations: { select: { invoiceId: true } },
    invoiceId: true,
  },
});
if (!pay || !pay.voidedAt) {
  console.log("no cancelled payment to reinstate — run merge-cancel first");
  await prisma.$disconnect();
  process.exit(0);
}
const ids = pay.allocations.length ? pay.allocations.map((a) => a.invoiceId) : [pay.invoiceId];
const read = () => prisma.invoice.findMany({
  where: { id: { in: ids } },
  orderBy: { invoiceNumber: "asc" },
  select: { status: true, total: true, amountPaid: true, amountAdjusted: true, shipment: { select: { trackingNumber: true } } },
});
const cleared = await prisma.invoiceAdjustment.findMany({
  where: { paymentId: pay.id },
  select: { amount: true, reversedAt: true, invoiceId: true },
});
const owed = cleared.filter((a) => a.reversedAt !== null).reduce((s, a) => s + Number(a.amount), 0);
console.log(`reinstating ${pay.receipt?.receiptNumber} — ${owed} was written off with it and taken back on cancelling\n`);
for (const i of await read()) console.log(`   ${i.shipment.trackingNumber}  ${i.status.padEnd(14)} due ${i.total} paid ${i.amountPaid} cleared ${i.amountAdjusted}`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("dialog", (d) => d.accept());
await page.setViewport({ width: 1500, height: 1400 });
await page.setCookie(...(await cookies("finance@targetexpress.co.tz")));
await page.goto(`${BASE}/app/finance/transactions`, { waitUntil: "networkidle2" });
await wait(1500);

const opened = await page.evaluate((rct) => {
  /* The SMALLEST element that names this receipt and carries the button. The
     page lists a dozen cancelled payments, each with its own Reinstate — take
     an ancestor and you reinstate somebody else's. */
  const holders = [...document.querySelectorAll("tr,li,div")].filter(
    (e) => e.textContent.includes(rct) && [...e.querySelectorAll("button")].some((b) => /Reinstate/i.test(b.innerText))
  );
  if (holders.length === 0) return "no row for " + rct;
  const row = holders.reduce((small, e) => (e.textContent.length < small.textContent.length ? e : small));
  const b = [...row.querySelectorAll("button")].find((x) => /Reinstate/i.test(x.innerText));
  if (!b) return "no Reinstate button";
  b.click();
  return null;
}, pay.receipt?.receiptNumber ?? "");
if (opened) { bad(opened); await browser.close(); await prisma.$disconnect(); process.exit(1); }
await wait(1400);
const confirmed = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /^Reinstate it$/i.test(x.innerText.trim()));
  if (!b) return "no confirm button — buttons on screen: " +
    [...document.querySelectorAll("button")].map((x) => x.innerText.trim()).filter(Boolean).slice(0, 30).join(" | ");
  b.click();
  return null;
});
if (confirmed) console.log("   " + confirmed);
await wait(1200);
const said = await page.evaluate(() => document.body.innerText.match(/[^\n]*(cannot|refus|error|Working)[^\n]*/i)?.[0] ?? null);
if (said) console.log("   screen says: " + said.trim().slice(0, 160));
await wait(4000);

console.log("\nafter:");
const after = await read();
for (const i of after) console.log(`   ${i.shipment.trackingNumber}  ${i.status.padEnd(14)} due ${i.total} paid ${i.amountPaid} cleared ${i.amountAdjusted}`);

const back = await prisma.payment.findUnique({ where: { id: pay.id }, select: { voidedAt: true } });
back?.voidedAt === null ? ok("the payment is live again") : bad("the payment is still cancelled");

const nowCleared = after.reduce((s, i) => s + Number(i.amountAdjusted), 0);
Math.abs(nowCleared - owed) < 0.005
  ? ok(`the write-off came back with it: ${nowCleared}`)
  : bad(`the bills carry ${nowCleared} of write-off, expected ${owed}`);

const stillOwing = after.filter((i) => Number(i.total) - Number(i.amountPaid) - Number(i.amountAdjusted) > 0.005);
stillOwing.length === 0
  ? ok("every bill is settled again — nothing is left owing that Finance had cleared")
  : bad(`${stillOwing.map((i) => i.shipment.trackingNumber).join(", ")} still owe money that had been written off`);

const live = await prisma.invoiceAdjustment.count({ where: { paymentId: pay.id, reversedAt: null } });
live === cleared.length
  ? ok("the write-off row reads as a live decision again, not a reversed one")
  : bad(`${live} of ${cleared.length} write-off rows are live`);

await browser.close();
await prisma.$disconnect();
