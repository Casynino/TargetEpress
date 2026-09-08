/**
 * THE FARE, ON A CLAIM ALREADY RAISED.
 *
 *   node scripts/e2e/claim-transport.mjs
 *
 * The customer hands over one sum and part of it is the driver's fare. Support
 * knows that at the counter and Finance finds it out when they ring to check —
 * and neither could say so on a claim already sent up. The whole transfer was
 * then verified as freight, crediting the bill with money already on its way
 * out to whoever drove.
 *
 * This drives the real dialog: type a fare, save, and check that the claim
 * carries it AND that the bill's share came down by exactly that much.
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
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: c1.map((c) => c.split(";")[0]).join("; ") },
    body: new URLSearchParams({ csrfToken, email, password: PW, redirect: "false" }),
  });
  return [...c1, ...r2.headers.getSetCookie()].map((c) => { const p = c.split(";")[0]; const i = p.indexOf("="); return { name: p.slice(0, i), value: p.slice(i + 1), url: BASE }; }).filter((c) => c.name && c.value);
}

/* A pending claim answering ONE bill and carrying no fare yet. A merged claim
   is deliberately refused a fare here — the difference would have more than one
   place to go — so picking one would be testing the refusal, not the field. */
const candidates = await prisma.paymentSubmission.findMany({
  where: { status: "PENDING", transportAmount: 0 },
  orderBy: { submittedAt: "asc" },
  select: {
    id: true, submissionNumber: true, amount: true, currency: true,
    allocations: { select: { id: true, amount: true } },
  },
});
const claim = candidates.find((c) => c.allocations.length <= 1);
if (!claim) {
  console.log("no single-bill pending claim to work with — nothing to test");
  await prisma.$disconnect();
  process.exit(0);
}
const total = Number(claim.amount);
const fare = Math.max(1, Math.round(total * 0.1));
console.log(`${claim.submissionNumber}: ${claim.currency} ${total.toLocaleString()} claimed, adding a ${fare.toLocaleString()} fare\n`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1400 });
await page.setCookie(...(await cookies("finance@targetexpress.co.tz")));
await page.goto(`${BASE}/app/finance/verify`, { waitUntil: "networkidle2" });
await wait(600);

const opened = await page.evaluate((n) => {
  const li = document.getElementById(n);
  if (!li) return "row not on the queue";
  const b = [...li.querySelectorAll("button")].find((x) => /Edit/.test(x.innerText));
  if (!b) return "no Edit button";
  b.click();
  return null;
}, claim.submissionNumber);
if (opened) { bad(opened); await browser.close(); await prisma.$disconnect(); process.exit(1); }
await wait(2500);

const hasField = await page.evaluate(() => Boolean(document.getElementById("sub-transport")));
hasField ? ok("the correction dialog asks for transport") : bad("no transport field in the dialog");

const shown = await page.evaluate((fare) => {
  const el = document.getElementById("sub-transport");
  if (!el) return null;
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  setter.call(el, String(fare));
  el.dispatchEvent(new Event("input", { bubbles: true }));
  return el.parentElement?.innerText.replace(/\s+/g, " ") ?? null;
}, fare);
await wait(600);
/* The split is stated below the two fields, not beside the box — the fare and
   the till it is settled from share a row now, so the sentence belongs to the
   dialog rather than to the input's own parent. */
const preview = await page.evaluate(() => {
  const field = document.getElementById("sub-transport");
  const panel = field?.closest('[role="dialog"]') ?? field?.closest("form") ?? document.body;
  return panel.innerText.replace(/\s+/g, " ");
});
preview.includes((total - fare).toLocaleString())
  ? ok(`the dialog says the bill gets the rest: ${(total - fare).toLocaleString()}`)
  : bad(`the dialog does not show ${(total - fare).toLocaleString()} — it says "${preview}"`);

/* And where it was settled from — a fare with no till behind it is money that
   left no account, so the register would balance while the cash box did not. */
const till = await page.evaluate(() => {
  const sel = document.getElementById("sub-transport-source");
  if (!sel) return null;
  const pick = [...sel.options].find((o) => o.value);
  if (!pick) return "no till offered";
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value").set;
  setter.call(sel, pick.value);
  sel.dispatchEvent(new Event("change", { bubbles: true }));
  return pick.text;
});
till && till !== "no till offered"
  ? ok(`and asks where it was paid from — picked "${till}"`)
  : bad(`no transport source to pick (${till})`);
/* Only tills a driver can really be paid out of. */
const kinds = await page.evaluate(() => {
  const sel = document.getElementById("sub-transport-source");
  return sel ? [...sel.options].map((o) => o.text) : [];
});
kinds.some((k) => /bank/i.test(k))
  ? bad(`a bank account is offered for a fare: ${kinds.join(", ")}`)
  : ok("and no bank account is offered — a driver is paid cash or mobile money");

await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /Save the correction/.test(x.innerText));
  b?.click();
});
await wait(4000);

const after = await prisma.paymentSubmission.findUnique({
  where: { id: claim.id },
  select: {
    amount: true, transportAmount: true,
    transportSource: { select: { name: true, kind: true } },
    allocations: { select: { amount: true } },
  },
});
Number(after.transportAmount) === fare
  ? ok(`the claim now carries a ${fare.toLocaleString()} fare`)
  : bad(`the claim carries ${Number(after.transportAmount)} of transport, expected ${fare}`);
Number(after.amount) === total
  ? ok("what the customer handed over is unchanged")
  : bad(`the total moved to ${Number(after.amount)}`);
/*
  Two shapes of claim, and the bill's share is stated differently in each. A
  claim raised against one bill carries no allocation row at all — verifying it
  works the cargo half out as amount minus fare, which is what recordPayment
  takes. A claim that carries rows has to have them restated, or Finance
  verifies a figure the split cannot account for.
*/
if (after.allocations.length === 0) {
  const implied = Number(after.amount) - Number(after.transportAmount);
  Math.abs(implied - (total - fare)) < 0.005
    ? ok(`no split to restate; the bill's share works out at ${implied.toLocaleString()}`)
    : bad(`the implied share is ${implied}, expected ${total - fare}`);
} else {
  const share = after.allocations.reduce((s, a) => s + Number(a.amount), 0);
  Math.abs(share - (total - fare)) < 0.005
    ? ok(`the bill's share came down to ${share.toLocaleString()}`)
    : bad(`the bill's share is ${share.toLocaleString()}, expected ${(total - fare).toLocaleString()}`);
}

after.transportSource
  ? ok(`and the claim says where it came from: ${after.transportSource.name} (${after.transportSource.kind})`)
  : bad("the claim carries no transport source");

/* Put it back, so the fixture is unchanged for the next run. */
await prisma.paymentSubmission.update({
  where: { id: claim.id },
  data: { transportAmount: 0, transportSourceId: null },
});
for (const a of claim.allocations) {
  await prisma.submissionAllocation.update({ where: { id: a.id }, data: { amount: a.amount } });
}
await browser.close();
await prisma.$disconnect();
