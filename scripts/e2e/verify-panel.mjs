/**
 * CONFIRMING A CLAIM THROUGH THE PANEL FINANCE ACTUALLY USES.
 *
 *   node scripts/e2e/verify-panel.mjs
 *
 * The verify dialog carries what the counter carries: the cargo charge, the
 * fare and the till it leaves from, the bill's own discount and rate doors,
 * the split in words, the difference, the account, the proof and the date.
 * This drives it end to end and checks the payment it produces is the one the
 * screen described.
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

/* A pending claim answering one bill, so the fare has one place to go. */
const claims = await prisma.paymentSubmission.findMany({
  where: { status: "PENDING" },
  orderBy: { submittedAt: "desc" },
  select: { id: true, submissionNumber: true, amount: true, currency: true,
    invoiceId: true, allocations: { select: { id: true } },
    invoice: { select: { invoiceNumber: true, total: true, amountPaid: true, amountAdjusted: true } } },
});
const claim = claims.find((c) => c.allocations.length <= 1 && Number(c.amount) > 1000);
if (!claim) { console.log("no single-bill claim big enough to split — nothing to drive"); await prisma.$disconnect(); process.exit(0); }
const fare = 1000;
const cargo = Number(claim.amount) - fare;
console.log(`${claim.submissionNumber}: ${claim.currency} ${Number(claim.amount).toLocaleString()} claimed`);
console.log(`confirming it as ${cargo.toLocaleString()} freight + ${fare.toLocaleString()} fare\n`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("dialog", (d) => d.accept());
await page.setViewport({ width: 1400, height: 1500 });
await page.setCookie(...(await cookies("finance@targetexpress.co.tz")));
await page.goto(`${BASE}/app/finance/verify`, { waitUntil: "networkidle2" });
await wait(2000);

const opened = await page.evaluate((n) => {
  const li = document.getElementById(n);
  if (!li) return "row missing";
  const b = [...li.querySelectorAll("button")].find((x) => /Verify payment/.test(x.innerText));
  if (!b) return "no Verify button";
  b.click();
  return null;
}, claim.submissionNumber);
if (opened) { bad(opened); await browser.close(); await prisma.$disconnect(); process.exit(1); }
await wait(2500);

/* Every field the counter has, on this dialog. */
const has = await page.evaluate(() => ({
  cargo: Boolean(document.querySelector('input[id^="cargo-"]')),
  fare: Boolean(document.querySelector('input[id^="fare-"]')),
  till: Boolean(document.querySelector('select[id^="transport-source-"]')),
  account: Boolean(document.querySelector('select[id^="account-"]')),
  proof: Boolean(document.querySelector('input[type="file"][name="proof"]')),
  discount: /Give a discount|Change the discount/.test(document.body.innerText),
  rate: /Change the rate/.test(document.body.innerText),
  date: /change the date/i.test(document.body.innerText),
}));
for (const [name, there] of Object.entries(has)) {
  there ? ok(`the panel offers ${name}`) : bad(`the panel is missing ${name}`);
}

const set = (sel, v) => page.evaluate(({ sel, v }) => {
  const el = document.querySelector(sel);
  if (!el) return false;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}, { sel, v });

await set('input[id^="cargo-"]', String(cargo));
await set('input[id^="fare-"]', String(fare));
await wait(700);
const tillId = await page.evaluate(() => {
  const s = document.querySelector('select[id^="transport-source-"]');
  const o = [...s.options].find((x) => x.value);
  return o ? o.value : null;
});
await set('select[id^="transport-source-"]', tillId);
const acctId = await page.evaluate(() => {
  const s = document.querySelector('select[id^="account-"]');
  const o = [...s.options].find((x) => x.value);
  return o ? o.value : null;
});
await set('select[id^="account-"]', acctId);
await wait(600);

const split = await page.evaluate(() => {
  const d = document.querySelector("body > div .max-h-\\[85vh\\]");
  return d ? d.innerText.replace(/\s+/g, " ") : "";
});
split.includes("Total received")
  ? ok(`the split is stated: "${split.match(/Cargo charge [^C]*Total received [^ ]* [\d,]+/)?.[0] ?? "shown"}"`)
  : bad("no split shown");

await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /Confirm and record/.test(x.innerText));
  const f = b?.closest("form");
  if (f) f.requestSubmit(b); else b?.click();
});
await wait(9000);

const after = await prisma.paymentSubmission.findUnique({
  where: { id: claim.id },
  select: { status: true, transportAmount: true, transportSourceId: true,
    payment: { select: { amount: true, transportAmount: true, accountId: true, receipt: { select: { receiptNumber: true } } } } },
});
after.status === "VERIFIED" ? ok("the claim is verified") : bad(`the claim reads ${after.status}`);
if (after.payment) {
  Math.abs(Number(after.payment.amount) - Number(claim.amount)) < 0.005
    ? ok(`the payment records the whole transfer: ${Number(after.payment.amount).toLocaleString()}`)
    : bad(`the payment records ${Number(after.payment.amount)}, expected ${Number(claim.amount)}`);
  Math.abs(Number(after.payment.transportAmount) - fare) < 0.005
    ? ok(`and the fare Finance typed: ${fare.toLocaleString()}`)
    : bad(`the payment's fare is ${Number(after.payment.transportAmount)}, expected ${fare}`);
  after.payment.accountId === acctId ? ok("into the account Finance named") : bad("the wrong account");
  after.payment.receipt?.receiptNumber
    ? ok(`receipt ${after.payment.receipt.receiptNumber} issued`)
    : bad("no receipt");
} else bad("no payment was produced");
Number(after.transportAmount) === fare
  ? ok("and the claim itself keeps Finance's figure")
  : bad(`the claim carries ${Number(after.transportAmount)}`);

await browser.close();
await prisma.$disconnect();
