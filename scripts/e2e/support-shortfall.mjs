/**
 * SUPPORT'S ANSWER TRAVELLING TO FINANCE.
 *
 * Support takes the call, hears "that is all I am sending", ticks it, and
 * submits. Finance opens the verify screen, sees the figure, confirms. The
 * payment must record the real money and the gap must be written off — under
 * FINANCE's name, because Finance is the desk that may decide it.
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
    if (b) { b.click(); return b.innerText.replace(/\\s+/g, " ").slice(0, 70); }
    return null;
  };
`;

const invoice = await prisma.invoice.findFirst({
  where: { shipmentId: process.env.SHIPMENT_ID },
  select: { id: true, invoiceNumber: true, total: true, currency: true, exchangeRate: true,
    shipment: { select: { id: true, trackingNumber: true } } },
});
const rate = Number(invoice.exchangeRate);
const billTsh = Math.round(Number(invoice.total) * rate);
const SHORT = 500;
const paying = billTsh - SHORT;
console.log(`${invoice.shipment.trackingNumber} / ${invoice.invoiceNumber}`);
console.log(`bill TSh ${billTsh.toLocaleString()} · customer sends TSh ${paying.toLocaleString()} (${SHORT} short)`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("dialog", (d) => d.accept());
await page.setViewport({ width: 1500, height: 1400 });

step(1, "Support records the claim and ticks 'the rest is not coming'");
await page.setCookie(...(await cookies("support@targetexpress.co.tz")));
await page.goto(`${BASE}/app/collections/record/${invoice.id}`, { waitUntil: "networkidle2" });
await page.evaluate(SET);
await page.evaluate((v) => {
  const box = [...document.querySelectorAll("form input")].filter((i) => i.type !== "hidden")
    .find((i) => /^[\d,]+$/.test(i.value) && Number(i.value.replace(/,/g, "")) > 100);
  if (!box) throw new Error("no amount box on Support's form");
  window.__set(box, String(v));
}, paying);
await wait(900);
const notice = await page.evaluate(() =>
  [...document.querySelectorAll("div")].filter((n) => /sent less than the bill/.test(n.textContent))
    .map((n) => n.innerText.replace(/\s+/g, " ")).pop() ?? null);
notice ? ok(`Support sees: "${notice.slice(0, 150)}…"`) : bad("Support gets no shortfall notice");
const ticked = await page.evaluate(() => window.__click("Clear the last"));
ticked ? ok(`Support pressed "${ticked}"`) : bad("Support has no Clear button");
await wait(400);
const flag = await page.evaluate(() => document.querySelector('input[name="clearShortfall"]')?.value ?? null);
flag === "1" ? ok("the tick is on the claim") : bad(`flag ${flag}`);
await page.evaluate(() => {
  const sel = document.querySelector('select[name="accountId"]');
  if (sel) window.__set(sel, [...sel.options].find((o) => o.value).value);
});
await wait(300);
const sent = await page.evaluate(() => window.__click("Submit to Finance|Send to Finance"));
console.log(`   ${sent ?? "(no submit button)"}`);
await wait(5000);

const claim = await prisma.paymentSubmission.findFirst({
  where: { invoiceId: invoice.id },
  orderBy: { submittedAt: "desc" },
  select: { id: true, submissionNumber: true, status: true, amount: true, clearShortfall: true,
    submittedBy: { select: { name: true } } },
});
claim ? ok(`claim ${claim.submissionNumber} raised by ${claim.submittedBy?.name}, ${claim.amount}`) : bad("no claim was raised");
claim?.clearShortfall === true
  ? ok("the claim carries Support's answer")
  : bad(`clearShortfall on the claim is ${claim?.clearShortfall}`);

step(2, "Finance opens the verify queue and confirms it");
await page.deleteCookie(...(await page.cookies()));
await page.setCookie(...(await cookies("finance@targetexpress.co.tz")));
await page.goto(`${BASE}/app/collections/verify`, { waitUntil: "networkidle2" });
await page.evaluate(SET);
const seen = await page.evaluate(() =>
  [...document.querySelectorAll("*")].filter((n) => /Clear the last/.test(n.textContent) && n.children.length === 0)
    .map((n) => n.textContent.replace(/\s+/g, " ")).pop() ?? null);
await page.evaluate(() => window.__click("Verify payment"));
await wait(1200);
const panel = await page.evaluate(() => ({
  tick: document.querySelector('input[name="clearShortfall"]')?.value ?? null,
  ceiling: document.querySelector('input[name="clearShortfallUpTo"]')?.value ?? null,
  says: [...document.querySelectorAll("label")].filter((n) => /Clear the last/.test(n.textContent))
    .map((n) => n.innerText.replace(/\s+/g, " ")).pop() ?? null,
}));
panel.says ? ok(`Finance sees: "${panel.says.slice(0, 140)}…"`) : bad("the verify panel shows no write-off tick");
panel.tick === "1" ? ok("pre-ticked from Support's answer") : bad(`tick reads ${panel.tick}`);
panel.ceiling ? ok(`ceiling travelling: ${panel.ceiling}`) : bad("no ceiling on the form");
await page.evaluate(() => {
  const sel = document.querySelector('select[name="accountId"]');
  if (sel) window.__set(sel, [...sel.options].find((o) => o.value).value);
});
await wait(300);
await page.evaluate(() => window.__click("Confirm and record"));
await wait(7000);

step(3, "What the books say");
const after = await prisma.invoice.findUnique({
  where: { id: invoice.id },
  select: { status: true, total: true, amountPaid: true, amountAdjusted: true,
    payments: { orderBy: { paidAt: "desc" }, take: 1, select: { id: true, amount: true, currency: true } },
    adjustments: { where: { reversedAt: null }, select: { amount: true, currency: true, paymentId: true, createdBy: { select: { name: true } } } },
    submissions: { orderBy: { submittedAt: "desc" }, take: 1, select: { status: true } },
    shipment: { select: { pickupNote: { select: { noteNumber: true } } } } },
});
const pay = after.payments[0];
const adj = after.adjustments[0];
console.log(`   CLAIM   ${after.submissions[0]?.status}`);
console.log(`   PAYMENT ${pay ? `${pay.currency} ${Number(pay.amount).toLocaleString()}` : "none"}`);
console.log(`   BILL    ${after.status} | paid ${after.amountPaid} | adjusted ${after.amountAdjusted}`);
console.log(`   ADJUST  ${adj ? `${adj.currency} ${adj.amount} by ${adj.createdBy?.name}` : "none"}`);
console.log(`   NOTE    ${after.shipment.pickupNote?.noteNumber ?? "none"}`);

pay && Number(pay.amount) === paying ? ok("the payment kept the real money") : bad(`payment ${pay?.amount}`);
after.status === "PAID" ? ok("bill settled") : bad(`status ${after.status}`);
adj ? ok(`write-off ${adj.amount} exists`) : bad("no adjustment written");
adj?.createdBy?.name && /aziza|finance/i.test(adj.createdBy.name)
  ? ok(`decided under Finance's name (${adj.createdBy.name}) — not Support's`)
  : bad(`adjustment made by ${adj?.createdBy?.name}`);
adj?.paymentId === pay?.id ? ok("linked to the payment, so a cancel takes it back") : bad("not linked to the payment");
const fromAdj = await prisma.ledgerEntry.count({ where: { sourceEntity: "InvoiceAdjustment" } });
fromAdj === 0 ? ok("still no ledger line from any adjustment") : bad(`${fromAdj} ledger lines`);
after.shipment.pickupNote ? ok("cargo can go") : bad("no pickup note");

await browser.close();
await prisma.$disconnect();
