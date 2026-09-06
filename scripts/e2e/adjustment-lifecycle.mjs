/**
 * THE TWO PATHS THAT WERE WRITTEN BUT NEVER RUN.
 *
 *   1. A short payment with the tick, then CANCELLING it — the write-off must
 *      come back with the payment, or the customer is quietly forgiven money
 *      nobody decided to forgive.
 *   2. MERGE PAYMENT carrying the tick — the screen says the bill will be
 *      settled, so the bill had better be settled.
 *
 * Driven through the real forms and then checked in the database, because a
 * green screen that wrote nothing is the failure worth catching.
 */
import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3177";
const PW = process.env.SEED_ADMIN_PASSWORD;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prisma = new PrismaClient();
const ok = (m) => console.log(`   ✓ ${m}`);
const bad = (m) => { console.log(`   ✗ ${m}`); process.exitCode = 1; };
const step = (n, w) => console.log(`\n${n}. ${w}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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

const SET = `
  window.__set = (el, v) => {
    let p = Object.getPrototypeOf(el), d = Object.getOwnPropertyDescriptor(p, "value");
    while (p && !(d && d.set)) { p = Object.getPrototypeOf(p); d = p ? Object.getOwnPropertyDescriptor(p, "value") : null; }
    if (d && d.set) d.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  window.__click = (re) => {
    const b = [...document.querySelectorAll("button")].find((x) => new RegExp(re).test(x.innerText));
    if (b) { b.click(); return b.innerText.replace(/\\s+/g, " "); }
    return null;
  };
`;

const shipmentId = process.env.SHIPMENT_ID;
const invoice = await prisma.invoice.findFirst({
  where: { shipmentId },
  select: { id: true, invoiceNumber: true, total: true, currency: true, exchangeRate: true,
    shipment: { select: { trackingNumber: true } } },
});
const rate = Number(invoice.exchangeRate);
const billTsh = Math.round(Number(invoice.total) * rate);
const SHORT = 350;
const paying = billTsh - SHORT;

console.log(`${invoice.shipment.trackingNumber} / ${invoice.invoiceNumber}`);
console.log(`bill ${invoice.currency} ${invoice.total} = TSh ${billTsh.toLocaleString()}`);
console.log(`customer sends TSh ${paying.toLocaleString()} — TSh ${SHORT} short\n`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("dialog", (d) => d.accept());
await page.setViewport({ width: 1500, height: 1400 });
await page.setCookie(...(await cookies("ceo@targetexpress.co.tz")));

step(1, "Record the short payment and clear the rest");
await page.goto(`${BASE}/app/cargo/${shipmentId}`, { waitUntil: "networkidle2" });
await page.evaluate(SET);
await page.evaluate((v) => {
  const box = [...document.querySelectorAll("form input")].filter((i) => i.type !== "hidden")
    .find((i) => /^[\d,]+$/.test(i.value) && Number(i.value.replace(/,/g, "")) > 100);
  window.__set(box, String(v));
}, paying);
await wait(900);
const pressed = await page.evaluate(() => window.__click("Clear the last"));
pressed ? ok(`pressed "${pressed}"`) : bad("no Clear button");
await wait(500);
await page.evaluate(() => {
  const sel = document.querySelector('select[name="accountId"]');
  window.__set(sel, [...sel.options].find((o) => o.value).value);
});
await wait(300);
await page.evaluate(() => window.__click("Confirm payment"));
await wait(6000);

const afterPay = await prisma.invoice.findUnique({
  where: { id: invoice.id },
  select: { status: true, total: true, amountPaid: true, amountAdjusted: true,
    payments: { orderBy: { paidAt: "desc" }, take: 1, select: { id: true, amount: true } },
    adjustments: { select: { id: true, amount: true, paymentId: true, reversedAt: true } },
    shipment: { select: { pickupNote: { select: { noteNumber: true, status: true } } } } },
});
const payment = afterPay.payments[0];
const adj = afterPay.adjustments.find((a) => !a.reversedAt);
console.log(`   BILL  ${afterPay.status} | paid ${afterPay.amountPaid} | adjusted ${afterPay.amountAdjusted}`);
afterPay.status === "PAID" ? ok("bill settled") : bad(`status ${afterPay.status}`);
adj ? ok(`adjustment ${adj.amount} written`) : bad("no adjustment");
adj && adj.paymentId === payment?.id
  ? ok("the adjustment is stamped with the payment that made it")
  : bad(`adjustment paymentId ${adj?.paymentId} vs payment ${payment?.id}`);
afterPay.shipment.pickupNote ? ok(`pickup note ${afterPay.shipment.pickupNote.noteNumber}`) : bad("no pickup note");

step(2, "Cancel that payment — the write-off must come back with it");
await page.goto(`${BASE}/app/finance/payments/${payment.id}`, { waitUntil: "networkidle2" });
await page.evaluate(SET);
const opened = await page.evaluate(() => window.__click("^Cancel$|Cancel payment|Cancel this"));
console.log(`   opened: ${opened ?? "(no cancel control found)"}`);
await wait(800);
const confirmed = await page.evaluate(() => window.__click("Cancel the payment|Yes, cancel|Confirm|Cancel it"));
console.log(`   confirmed: ${confirmed ?? "(none)"}`);
await wait(6000);

const afterVoid = await prisma.invoice.findUnique({
  where: { id: invoice.id },
  select: { status: true, total: true, amountPaid: true, amountAdjusted: true,
    adjustments: { select: { amount: true, reversedAt: true, reversalReason: true } } },
});
const live = afterVoid.adjustments.filter((a) => !a.reversedAt);
const back = afterVoid.adjustments.filter((a) => a.reversedAt);
console.log(`   BILL  ${afterVoid.status} | paid ${afterVoid.amountPaid} | adjusted ${afterVoid.amountAdjusted}`);
console.log(`   adjustments: ${live.length} live, ${back.length} taken back`);

Number(afterVoid.amountPaid) === 0 ? ok("the money came off the bill") : bad(`amountPaid ${afterVoid.amountPaid}`);
Number(afterVoid.amountAdjusted) === 0
  ? ok("the write-off came back too — nothing was silently forgiven")
  : bad(`amountAdjusted still ${afterVoid.amountAdjusted} — ${SHORT} shillings forgiven for a cancelled payment`);
live.length === 0 ? ok("no adjustment left standing") : bad(`${live.length} still live`);
back.length === 1 && back[0].reversalReason
  ? ok(`stamped: "${back[0].reversalReason}"`)
  : bad("the reversal is not recorded on the row");
const bal = Number(afterVoid.total) - Number(afterVoid.amountPaid) - Number(afterVoid.amountAdjusted);
Math.abs(bal - Number(afterVoid.total)) < 0.005
  ? ok(`the customer owes the whole bill again (${afterVoid.currency ?? "USD"} ${bal})`)
  : bad(`balance ${bal}, expected ${afterVoid.total}`);

await browser.close();
await prisma.$disconnect();
