/**
 * PUTTING A FLIGHT BACK IN THE AIR LEAVES NOTHING BEHIND.
 *
 *   node scripts/e2e/undo-arrival.mjs
 *
 * The owner's words for this button: everything that was in the batch goes
 * back to where it was, like nothing happened. Un-ticking the boxes was only
 * part of it — Dar check-in also writes the confirmed weight and piece count
 * onto each consignment and creates a row for every carton that turned up
 * beyond the manifest. This checks all of it comes back.
 *
 * Driven through the real screens: a flight is marked arrived, a consignment
 * is weighed heavier and counted higher than it was booked, then the arrival
 * is undone.
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

/*
  A LANDED FLIGHT WITH ONE FRESH CONSIGNMENT ON IT.

  Undoing an arrival is what this tests, so the flight has to be down and the
  cargo on it has to have no money against it — the undo refuses anything that
  has been paid for, deliberately. A box is added through the Dar screen the
  warehouse uses, so what is tested is what the floor produces.
*/
const SET = `window.__set=(el,v)=>{let p=Object.getPrototypeOf(el),d=Object.getOwnPropertyDescriptor(p,"value");while(p&&!(d&&d.set)){p=Object.getPrototypeOf(p);d=p?Object.getOwnPropertyDescriptor(p,"value"):null;}if(d&&d.set)d.set.call(el,v);else el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};`;

const landedBatch = await prisma.batch.findFirst({
  where: { permanent: false, status: { in: ["ARRIVED", "VERIFIED"] }, closedAt: null },
  orderBy: { arrivedAt: "desc" },
  select: { id: true, batchNumber: true },
});
if (!landedBatch) { console.log("no landed flight to work with"); await prisma.$disconnect(); process.exit(0); }
const customer = await prisma.customer.findFirst({ select: { code: true, name: true } });

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("dialog", (d) => d.accept());
await page.setViewport({ width: 1500, height: 1400 });
await page.setCookie(...(await cookies("ceo@targetexpress.co.tz")));

const known = new Set((await prisma.shipment.findMany({ select: { id: true } })).map((r) => r.id));
await page.goto(`${BASE}/app/receive/${landedBatch.id}/add`, { waitUntil: "networkidle2" });
await page.evaluate(SET);
await page.evaluate(() => {
  const cat = document.querySelector('select[name="cargoCategory"]');
  if (cat) window.__set(cat, [...cat.options].find((o) => o.value)?.value);
});
await wait(700);
await page.evaluate(() => {
  const type = document.querySelector('select[name="cargoTypeId"]');
  if (type) window.__set(type, [...type.options].find((o) => o.value)?.value);
  for (const [n, v] of [["description", "Undo-the-arrival test box"], ["weightKg", "4"], ["packages", "3"]]) {
    const el = document.querySelector(`[name="${n}"]`);
    if (el) window.__set(el, v);
  }
});
await page.evaluate((code) => {
  const box = document.querySelector('[name="customer-search"]')
    || [...document.querySelectorAll("input")].find((i) => /CUS-|0762/.test(i.placeholder || ""));
  if (box) window.__set(box, code);
}, customer.code);
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((x) => /Find a customer/.test(x.innerText))?.click();
});
await wait(2200);
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((b) => /CUS-\d+/.test(b.innerText))?.click();
});
await wait(700);
await page.evaluate(() => {
  [...document.querySelectorAll("button")].find((x) => /^Add cargo to /.test(x.innerText.trim()))?.click();
});
await wait(5000);

const made = await prisma.shipment.findFirst({
  where: { id: { notIn: [...known] } },
  select: { id: true, trackingNumber: true },
});
if (!made) { console.log("the box was not registered — nothing to test"); await browser.close(); await prisma.$disconnect(); process.exit(0); }
const batch = { id: landedBatch.id, batchNumber: landedBatch.batchNumber, shipments: [made] };

const target = batch.shipments[0];
const before = await prisma.shipment.findUnique({
  where: { id: target.id },
  select: { weightKg: true, packages: true, status: true, _count: { select: { packageList: true } } },
});
const newWeight = Number(before.weightKg) + 0.6;
const newCount = before.packages + 2;
console.log(`${batch.batchNumber} · ${target.trackingNumber}: booked ${before.weightKg} kg in ${before.packages} boxes (${before._count.packageList} rows)`);
console.log(`checking it in as ${newWeight} kg in ${newCount} boxes\n`);

await page.setCookie(...(await cookies("warehouse@targetexpress.co.tz")));

/* Weigh and count it through the panel the Dar floor actually uses. */
await page.goto(`${BASE}/app/receive/${batch.id}`, { waitUntil: "networkidle2" });
await wait(1500);
await page.evaluate((tn) => {
  const row = [...document.querySelectorAll("tr,li")].find((e) => e.textContent.includes(tn));
  const b = row && [...row.querySelectorAll("button")].find((x) => /⚖|weigh|check it in|Check in/i.test(x.innerText));
  (b ?? row?.querySelector("button"))?.click();
}, target.trackingNumber);
await wait(1400);
await page.evaluate(({ w, c }) => {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  const wk = document.querySelector('input[name="weightKg"]');
  if (wk) { set.call(wk, String(w)); wk.dispatchEvent(new Event("input", { bubbles: true })); }
  const pk = document.querySelector('input[name="packagesArrived"]');
  if (pk) { set.call(pk, String(c)); pk.dispatchEvent(new Event("input", { bubbles: true })); }
}, { w: newWeight, c: newCount });
await wait(700);
await page.evaluate(() => {
  const f = [...document.querySelectorAll("form")].find((x) => x.querySelector('input[name="weightKg"]'));
  const b = f && [...f.querySelectorAll("button")].find((x) => !x.disabled && /OK|check it in/i.test(x.innerText));
  b?.click();
});
await wait(6000);

const checked = await prisma.shipment.findUnique({
  where: { id: target.id },
  select: { weightKg: true, packages: true, _count: { select: { packageList: true } } },
});
console.log(`   after check-in: ${checked.weightKg} kg, ${checked.packages} boxes, ${checked._count.packageList} rows`);
Number(checked.weightKg) === newWeight ? ok("the Dar weight is on the consignment") : bad(`weight is ${checked.weightKg}, expected ${newWeight}`);
checked.packages === newCount ? ok("and the Dar count") : bad(`count is ${checked.packages}, expected ${newCount}`);
checked._count.packageList > before._count.packageList ? ok("and the extra cartons got their own rows") : bad("no extra package rows were created");

/* Now put the flight back in the air. */
await page.setCookie(...(await cookies("ceo@targetexpress.co.tz")));
await page.goto(`${BASE}/app/shipments/${batch.id}`, { waitUntil: "networkidle2" });
await wait(1500);
/* The panel is collapsed behind its own heading; the submit inside it is the
   one that says "Put <flight> back in the air". */
const opened2 = await page.evaluate(() => {
  const toggle = [...document.querySelectorAll("button")].find((x) =>
    /Undo arrival|Checked in the wrong flight/i.test(x.innerText)
  );
  if (toggle) { toggle.click(); return null; }
  const direct = [...document.querySelectorAll("button")].find((x) => /back in the air/i.test(x.innerText));
  if (direct) return null;
  return "no undo control — " + [...document.querySelectorAll("button")].map((x) => x.innerText.trim().replace(/\s+/g, " ")).filter(Boolean).slice(0, 25).join(" | ");
});
if (opened2) { bad(opened2); await browser.close(); await prisma.$disconnect(); process.exit(1); }
await wait(1800);
console.log("   buttons: " + await page.evaluate(() => [...document.querySelectorAll("button")].map((x) => x.innerText.trim().replace(/\s+/g, " ")).filter(Boolean).slice(0, 20).join(" | ")));
const pressed = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /back in the air/i.test(x.innerText) && x.type === "submit");
  if (!b) return "no submit — " + [...document.querySelectorAll("button")].map((x) => `${x.innerText.trim().replace(/\s+/g, " ").slice(0,30)}[${x.type}]`).filter(Boolean).slice(0, 25).join(" | ");
  const form = b.closest("form");
  if (!form) return "the submit is not inside a form";
  /* requestSubmit, not click: it runs the form's own submit path, which is
     what a React form action listens to. */
  form.requestSubmit(b);
  return null;
});
if (pressed) { bad(pressed); await browser.close(); await prisma.$disconnect(); process.exit(1); }
await wait(8000);
console.log("   panel says: " + await page.evaluate(() => {
  const f = [...document.querySelectorAll("form")].find((x) => /back in the air/i.test(x.innerText));
  return f ? f.innerText.replace(/\s+/g, " ").slice(0, 400) : "(the undo form is gone from the page)";
}));
const refusal = await page.evaluate(() =>
  document.body.innerText.match(/[^\n]*(cannot|will stop this|refus|already)[^\n]*/i)?.[0] ?? null
);
if (refusal) console.log("   screen says: " + refusal.trim().slice(0, 180));

console.log("\nafter putting it back in the air:");
const after = await prisma.shipment.findUnique({
  where: { id: target.id },
  select: { weightKg: true, packages: true, status: true, arrivedAt: true, _count: { select: { packageList: true } } },
});
console.log(`   ${after.status} · ${after.weightKg} kg · ${after.packages} boxes · ${after._count.packageList} rows`);
Number(after.weightKg) === Number(before.weightKg)
  ? ok(`the weight is back to what Guangzhou booked (${before.weightKg} kg)`)
  : bad(`weight is ${after.weightKg}, expected ${before.weightKg}`);
after.packages === before.packages
  ? ok(`the count is back to ${before.packages}`)
  : bad(`count is ${after.packages}, expected ${before.packages}`);
after._count.packageList === before._count.packageList
  ? ok(`and the cartons the arrival invented are gone (${after._count.packageList} rows)`)
  : bad(`${after._count.packageList} package rows, expected ${before._count.packageList}`);
after.arrivedAt === null ? ok("no arrival date on a flight that is in the air") : bad("it still carries an arrival date");
const ticked = await prisma.package.count({ where: { shipmentId: target.id, receivedAt: { not: null } } });
ticked === 0 ? ok("and no box is ticked as received") : bad(`${ticked} boxes still read as received`);

await browser.close();
await prisma.$disconnect();
