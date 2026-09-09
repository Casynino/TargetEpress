/**
 * FINANCE TAKES A CLAIM OFF THE QUEUE WITHOUT RULING ON IT.
 *
 *   node scripts/e2e/verify-cancel.mjs
 *
 * Send it back asks Support to fix it and waits. This is the other thing: the
 * claim leaves as if it was never raised, so Finance can record the money
 * themselves or put the bill into a merged payment — which is impossible while
 * a claim is standing against it.
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
  return [...c1, ...r2.headers.getSetCookie()].map((c) => { const p = c.split(";")[0]; const i = p.indexOf("=");
    return { name: p.slice(0, i), value: p.slice(i + 1), url: BASE }; }).filter((c) => c.name && c.value);
}

const claim = await prisma.paymentSubmission.findFirst({
  where: { status: "PENDING" },
  select: { id: true, submissionNumber: true, amount: true, currency: true,
    invoiceId: true,
    invoice: { select: { invoiceNumber: true, total: true, amountPaid: true, status: true,
      shipment: { select: { trackingNumber: true } } } } },
});
if (!claim) { console.log("no pending claim to cancel"); await prisma.$disconnect(); process.exit(0); }
const before = { total: Number(claim.invoice.total), paid: Number(claim.invoice.amountPaid), status: claim.invoice.status };
console.log(`${claim.submissionNumber} — ${claim.invoice.invoiceNumber} (${claim.invoice.shipment.trackingNumber})`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1200 });
await page.setCookie(...(await cookies("finance@targetexpress.co.tz")));
await page.goto(`${BASE}/app/collections/verify`, { waitUntil: "networkidle2" });

const label = await page.evaluate(() =>
  [...document.querySelectorAll("button")].some((b) => b.textContent.trim() === "Verify"));
label ? ok('the button reads "Verify", not "Verify payment"') : bad("the button still says Verify payment");

const found = await page.evaluate((n) => {
  const row = [...document.querySelectorAll("li")].find((r) => r.textContent.includes(n));
  if (!row) return false;
  const b = [...row.querySelectorAll("button")].find((x) => x.textContent.includes("Cancel it"));
  if (!b) return "no-button";
  b.click();
  return true;
}, claim.submissionNumber);
found === true ? ok("Finance is offered Cancel it on the row") : bad(`no Cancel it button (${found})`);
await wait(700);

const asked = await page.evaluate(() => document.body.innerText.includes("Cancel this claim?"));
asked ? ok("it asks before doing anything") : bad("no confirmation");

await page.evaluate((n) => {
  const row = [...document.querySelectorAll("li")].find((r) => r.textContent.includes(n));
  const f = row.querySelector("form");
  f.requestSubmit([...f.querySelectorAll("button")].find((b) => b.textContent.includes("Yes, cancel it")));
}, claim.submissionNumber);
await wait(2500);

const after = await prisma.paymentSubmission.findUnique({
  where: { id: claim.id },
  select: { status: true, submissionNumber: true },
});
after?.status === "WITHDRAWN"
  ? ok(`${after.submissionNumber} is WITHDRAWN — not rejected, so nobody rings the customer`)
  : bad(`status is ${after?.status}, expected WITHDRAWN`);

/* The bill must be untouched and free again. */
const inv = await prisma.invoice.findUnique({
  where: { id: claim.invoiceId },
  select: { total: true, amountPaid: true, status: true,
    submissions: { where: { status: "PENDING" }, select: { id: true } } },
});
Number(inv.total) === before.total && Number(inv.amountPaid) === before.paid && inv.status === before.status
  ? ok("the bill is exactly as it was — nothing was paid, nothing was written off")
  : bad(`the bill moved: ${before.total}/${before.paid}/${before.status} → ${Number(inv.total)}/${Number(inv.amountPaid)}/${inv.status}`);
inv.submissions.length === 0
  ? ok("and no claim stands against it — it can be recorded or merged now")
  : bad("a claim is still standing against the bill");

/* No money was created. */
const linked = await prisma.paymentSubmission.findUnique({
  where: { id: claim.id },
  select: { paymentId: true },
});
linked?.paymentId
  ? bad("a payment was created — cancelling must move no money")
  : ok("no payment exists for it — no money moved");

await browser.close();
await prisma.$disconnect();
