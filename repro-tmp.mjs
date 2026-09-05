import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";
const BASE = "http://localhost:3177";
const PW = process.env.SEED_ADMIN_PASSWORD;
const prisma = new PrismaClient();
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

async function cookies(email) {
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  const c1 = r1.headers.getSetCookie();
  const { csrfToken } = await r1.json();
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: c1.map((c) => c.split(";")[0]).join("; ") },
    body: new URLSearchParams({ csrfToken, email, password: PW, redirect: "false" }),
  });
  return [...c1, ...r2.headers.getSetCookie()].map((c) => {
    const pair = c.split(";")[0]; const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), url: BASE };
  }).filter((c) => c.name && c.value);
}

const target = await prisma.invoice.findFirst({
  where: { invoiceNumber: "INV-EMPTY1" },
  select: { id: true, invoiceNumber: true, total: true, amountPaid: true, currency: true,
    shipment: { select: { id: true, trackingNumber: true, status: true } } },
  orderBy: { issuedAt: "desc" },
});
console.log("target", JSON.stringify(target));
if (!target?.shipment) { console.log("no target"); process.exit(0); }

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1200 });
await page.setCookie(...(await cookies("ceo@targetexpress.co.tz")));
await page.goto(`${BASE}/app/cargo/${target.shipment.id}`, { waitUntil: "networkidle2" });

const before = await page.evaluate(() => {
  const el = document.querySelector('input[type=hidden][name="transport"]');
  const amt = document.querySelector('input[type=hidden][name="amount"]');
  return { transportHidden: el ? JSON.stringify(el.value) : "ABSENT",
           amountHidden: amt ? JSON.stringify(amt.value) : "ABSENT",
           accounts: [...document.querySelectorAll('select[name="accountId"] option')].map(o=>o.value+"|"+o.textContent.trim()) };
});
console.log("hidden fields:", JSON.stringify(before, null, 1));

// pick an account, leave transport alone, submit
const submitted = await page.evaluate(() => {
  const form = document.querySelector('input[type=hidden][name="transport"]')?.closest("form");
  if (!form) return "NO FORM";
  const fd = new FormData(form);
  return JSON.stringify([...fd.entries()].filter(([k])=>k!=="proof").map(([k,v])=>[k, typeof v === "string" ? v : "(file)"]));
});
console.log("FormData the browser would send:", submitted);

const sel = await page.$('select[name="accountId"]');
if (sel) {
  const val = await page.evaluate(() => {
    const s = document.querySelector('select[name="accountId"]');
    const opt = [...s.options].find(o => o.value);
    return opt ? opt.value : null;
  });
  if (val) await page.select('select[name="accountId"]', val);
}
await new Promise(r=>setTimeout(r,300));
const btn = await page.evaluateHandle(() => {
  const form = document.querySelector('input[type=hidden][name="transport"]')?.closest("form");
  return [...form.querySelectorAll('button')].find(b => b.type === "submit" || /Confirm|Record/i.test(b.textContent));
});
const paidBefore = (await prisma.invoice.findUnique({where:{id:target.id}, select:{amountPaid:true,status:true}}));
await btn.asElement()?.click();
await new Promise(r=>setTimeout(r,4000));
const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g," "));
const formText = await page.evaluate(() => {
  const f = document.querySelector('input[type=hidden][name="transport"]')?.closest("form");
  return f ? f.innerText.replace(/\s+/g," ") : "NO FORM";
});
console.log("FORM TEXT AFTER SUBMIT:", formText);
console.log("MENTIONS 'Transport is required':", /Transport is required/i.test(text));
const paidAfter = (await prisma.invoice.findUnique({where:{id:target.id}, select:{amountPaid:true,status:true}}));
console.log("invoice before/after:", JSON.stringify(paidBefore), JSON.stringify(paidAfter));
await browser.close();
await prisma.$disconnect();
