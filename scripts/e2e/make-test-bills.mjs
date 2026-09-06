/**
 * Four fresh consignments on a landed flight, priced and ready to be paid.
 *
 * Built through the real screens — a box added to the flight at Dar, then the
 * price confirmed — so what the owner tests is what the warehouse produces,
 * not a row somebody inserted.
 */
import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";

const BASE = "http://localhost:3177";
const PW = process.env.SEED_ADMIN_PASSWORD;
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prisma = new PrismaClient();
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
`;

const batch = await prisma.batch.findFirst({
  where: { permanent: false, status: { in: ["IN_TRANSIT", "ARRIVED", "VERIFIED"] } },
  orderBy: { createdAt: "desc" },
  select: { id: true, batchNumber: true },
});
const customer = await prisma.customer.findFirst({ select: { code: true, name: true } });
const before = new Set((await prisma.shipment.findMany({ select: { id: true } })).map((s) => s.id));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("dialog", (d) => d.accept());
await page.setViewport({ width: 1500, height: 1300 });
await page.setCookie(...(await cookies("ceo@targetexpress.co.tz")));

const WEIGHTS = [3, 5, 2, 4];
for (const kg of WEIGHTS) {
  await page.goto(`${BASE}/app/receive/${batch.id}/add`, { waitUntil: "networkidle2" });
  await page.evaluate(SET);
  await page.evaluate(() => {
    const cat = document.querySelector('select[name="cargoCategory"]');
    if (cat) window.__set(cat, [...cat.options].find((o) => o.value)?.value);
  });
  await wait(700);
  await page.evaluate((w) => {
    const type = document.querySelector('select[name="cargoTypeId"]');
    if (type) window.__set(type, [...type.options].find((o) => o.value)?.value);
    for (const [n, v] of [["description", "Test cargo for the adjustment walkthrough"], ["weightKg", String(w)], ["packages", "1"]]) {
      const el = document.querySelector(`[name="${n}"]`);
      if (el) window.__set(el, v);
    }
  }, kg);
  await page.evaluate((code) => {
    const box = document.querySelector('[name="customer-search"]')
      || [...document.querySelectorAll("input")].find((i) => /CUS-|0762/.test(i.placeholder || ""));
    window.__set(box, code);
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
  await wait(4500);
}

const fresh = await prisma.shipment.findMany({
  where: { id: { notIn: [...before] } },
  select: { id: true, trackingNumber: true, invoice: { select: { id: true } } },
});

for (const s of fresh) {
  await page.goto(`${BASE}/app/cargo/${s.id}`, { waitUntil: "networkidle2" });
  await page.evaluate(() => {
    [...document.querySelectorAll("button")].find((x) => /Confirm the price|Confirm price|Confirm this price/i.test(x.innerText))?.click();
  });
  await wait(3000);
}

const ready = await prisma.invoice.findMany({
  where: { shipmentId: { in: fresh.map((s) => s.id) } },
  select: { invoiceNumber: true, status: true, total: true, currency: true, exchangeRate: true,
    shipment: { select: { id: true, trackingNumber: true } } },
  orderBy: { invoiceNumber: "asc" },
});

console.log(`\nFlight ${batch.batchNumber} · customer ${customer.name}\n`);
for (const i of ready) {
  const tsh = Math.round(Number(i.total) * Number(i.exchangeRate));
  console.log(`  ${i.shipment.trackingNumber}  ${i.status.padEnd(14)} ${i.currency} ${String(i.total).padStart(7)}  =  TSh ${tsh.toLocaleString().padStart(9)}`);
  console.log(`      ${BASE}/app/cargo/${i.shipment.id}`);
}

await browser.close();
await prisma.$disconnect();
