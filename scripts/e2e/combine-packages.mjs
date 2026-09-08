/**
 * COMBINING BOXES, AND THE FIGURES THAT MUST NOT MOVE.
 *
 *   node scripts/e2e/combine-packages.mjs
 *
 * The feature's whole promise is that a physical fact is recorded and nothing
 * else changes. So this drives the real dialog on the Dar floor and then checks
 * both halves: that the carton exists and names its boxes, and that every
 * weight, count and bill behind it is exactly what it was.
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

const snapshot = (ids) =>
  prisma.shipment.findMany({
    where: { id: { in: ids } },
    select: { id: true, trackingNumber: true, weightKg: true, packages: true, chargeableKg: true,
      invoice: { select: { total: true, freightCost: true, freightOverride: true } },
      packageList: { select: { id: true, reference: true, receivedAt: true, combinationId: true } } },
    orderBy: { trackingNumber: "asc" },
  });

const floor = await prisma.shipment.findMany({
  where: { status: "RECEIVED_AT_DAR", deletedAt: null },
  select: { id: true, trackingNumber: true, customerId: true, customer: { select: { name: true } },
    packageList: { select: { combinationId: true } } },
  take: 80,
});
const groups = new Map();
for (const s of floor) {
  if (s.packageList.length === 0 || s.packageList.some((p) => p.combinationId)) continue;
  groups.set(s.customerId, [...(groups.get(s.customerId) ?? []), s]);
}
const mine = [...groups.values()].find((v) => v.length >= 2);
if (!mine) { console.log("no two loose consignments for one customer on the floor — nothing to drive"); await prisma.$disconnect(); process.exit(0); }
const picked = mine.slice(0, 2);
const ids = picked.map((s) => s.id);
const before = await snapshot(ids);
console.log(`${picked[0].customer.name}: ${picked.map((s) => s.trackingNumber).join(" + ")}`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1600, height: 1100 });
await page.setCookie(...(await cookies("warehouse@targetexpress.co.tz")));
await page.goto(`${BASE}/app/inventory`, { waitUntil: "networkidle2" });

/* Narrow the floor to this customer first — the list is long, and the two rows
   have to be on screen together before either can be ticked. */
const box = await page.$('input[type="search"], input[placeholder*="Tracking"]');
if (box) {
  await box.click();
  await page.keyboard.type(picked[0].customer.name, { delay: 20 });
  await wait(900);
}

/* Find each row by its tracking number and tick it. */
for (const s of picked) {
  const ticked = await page.evaluate((tn) => {
    const row = [...document.querySelectorAll("tr")].find((r) => r.textContent.includes(tn));
    const box = row?.querySelector('input[type="checkbox"]');
    if (!box) return false;
    box.click();
    return true;
  }, s.trackingNumber);
  if (!ticked) bad(`could not tick ${s.trackingNumber} — is it on the floor list?`);
}
await wait(500);

const opened = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => x.textContent.includes("Combine packages"));
  if (!b || b.disabled) return false;
  b.click();
  return true;
});
opened ? ok("the floor list offers Combine packages on a selection") : bad("no Combine packages button appeared");
await wait(800);

const dialog = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
dialog.includes("Are you sure you want to combine these packages into one package?")
  ? ok("it asks before it does anything")
  : bad("no confirmation question");
for (const s of picked) {
  dialog.includes(s.trackingNumber) ? ok(`the dialog names ${s.trackingNumber}`) : bad(`${s.trackingNumber} is not named`);
}
dialog.includes(picked[0].customer.name) ? ok("and names the customer") : bad("the customer is not named");

const submitted = await page.evaluate(() => {
  const el = document.querySelector('input[name="statedWeightKg"]');
  if (!el) return false;
  const f = el.closest("form");
  f.requestSubmit([...f.querySelectorAll("button")].find((b) => b.textContent.includes("Yes, combine")));
  return true;
});
if (!submitted) bad("the dialog never opened, so nothing was submitted");
await wait(2500);

const combination = await prisma.packageCombination.findFirst({
  orderBy: { combinedAt: "desc" },
  select: { reference: true, stage: true, customerId: true, undoneAt: true, combinedByName: true,
    members: { select: { reference: true, shipmentId: true } } },
});
if (!combination) { bad("no combined package was created"); }
else {
  ok(`carton ${combination.reference} created by ${combination.combinedByName}`);
  combination.stage === "DAR" ? ok("recorded as a Dar combination") : bad(`stage is ${combination.stage}`);
  combination.customerId === picked[0].customerId ? ok("against the right customer") : bad("wrong customer on the carton");
  const memberShipments = new Set(combination.members.map((m) => m.shipmentId));
  ids.every((id) => memberShipments.has(id))
    ? ok(`every picked consignment is inside it (${combination.members.length} box(es))`)
    : bad("a picked consignment is not in the carton");
}

/* THE HALF THAT MATTERS: nothing else moved. */
const after = await snapshot(ids);
let moved = 0;
for (const [i, b] of before.entries()) {
  const a = after[i];
  const same = (x, y) => String(x ?? "") === String(y ?? "");
  if (!same(b.weightKg, a.weightKg)) { bad(`${b.trackingNumber} weight moved ${b.weightKg} → ${a.weightKg}`); moved++; }
  if (b.packages !== a.packages) { bad(`${b.trackingNumber} package count moved ${b.packages} → ${a.packages}`); moved++; }
  if (!same(b.chargeableKg, a.chargeableKg)) { bad(`${b.trackingNumber} chargeable weight moved`); moved++; }
  if (!same(b.invoice?.total, a.invoice?.total)) { bad(`${b.trackingNumber} bill total moved ${b.invoice?.total} → ${a.invoice?.total}`); moved++; }
  if (!same(b.invoice?.freightCost, a.invoice?.freightCost)) { bad(`${b.trackingNumber} freight moved`); moved++; }
  if (b.packageList.length !== a.packageList.length) { bad(`${b.trackingNumber} gained or lost a box row`); moved++; }
  const ticks = (l) => l.filter((p) => p.receivedAt !== null).length;
  if (ticks(b.packageList) !== ticks(a.packageList)) { bad(`${b.trackingNumber} check-in ticks changed`); moved++; }
}
if (moved === 0) ok("no weight, count, box row, check-in tick or bill moved on any of them");

/* The floor's own timeline says what happened. */
const history = await prisma.shipmentStatusHistory.findMany({
  where: { shipmentId: { in: ids } }, orderBy: { createdAt: "desc" }, take: ids.length,
  select: { note: true, fromStatus: true, toStatus: true, shipmentId: true },
});
history.length === ids.length && history.every((h) => (h.note ?? "").includes("Packages combined"))
  ? ok("each consignment's timeline says the packages were combined")
  : bad("the timeline does not record the combination on every consignment");
history.every((h) => h.fromStatus === h.toStatus)
  ? ok("and nothing was made to look like it moved status")
  : bad("the history invented a status change");

await browser.close();
await prisma.$disconnect();
