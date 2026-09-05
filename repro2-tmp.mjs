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
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: c1.map((c) => c.split(";")[0]).join("; ") },
    body: new URLSearchParams({ csrfToken, email, password: PW, redirect: "false" }) });
  return [...c1, ...r2.headers.getSetCookie()].map((c) => { const pair = c.split(";")[0]; const i = pair.indexOf("=");
    return { name: pair.slice(0, i), value: pair.slice(i + 1), url: BASE }; }).filter((c) => c.name && c.value);
}
const target = await prisma.invoice.findFirst({ where: { invoiceNumber: "INV-EMPTY2" }, select: { id:true, shipment:{select:{id:true}} } });
const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 1400 });
await page.setCookie(...(await cookies("ceo@targetexpress.co.tz")));
page.on("request", (req) => {
  if (req.method() === "POST") {
    const d = req.postData() || "";
    if (/transport/.test(d) || /invoiceId/.test(d)) console.log("POST BODY >>>", d.replace(/\r\n/g, "|").slice(0, 3000), "<<<");
  }
});
page.on("console", (m) => { const t = m.text(); if (/Transport|error/i.test(t)) console.log("CONSOLE:", t.slice(0,300)); });
await page.goto(`${BASE}/app/cargo/${target.shipment.id}`, { waitUntil: "networkidle2" });
await new Promise(r=>setTimeout(r,1500));
const fields = await page.evaluate(() => {
  const f = document.querySelector('input[type=hidden][name="transport"]')?.closest("form");
  return f ? [...new FormData(f).entries()].map(([k,v]) => k + "=" + (typeof v === "string" ? JSON.stringify(v) : "(file)")) : ["NO FORM"];
});
console.log("FORM FIELDS BEFORE SUBMIT:", JSON.stringify(fields, null, 1));
const acc = await page.evaluate(() => { const s = document.querySelector('select[name="accountId"]'); if (!s) return "NO ACCOUNT SELECT";
  const o = [...s.options].find(o=>o.value); return o ? o.value : "NO OPTION"; });
console.log("account:", acc);
if (acc && acc.startsWith("cm")) await page.select('select[name="accountId"]', acc);
await new Promise(r=>setTimeout(r,300));
const fields2 = await page.evaluate(() => {
  const f = document.querySelector('input[type=hidden][name="transport"]')?.closest("form");
  return [...new FormData(f).entries()].map(([k,v]) => k + "=" + (typeof v === "string" ? JSON.stringify(v) : "(file)"));
});
console.log("FORM FIELDS AT SUBMIT:", JSON.stringify(fields2, null, 1));
const clicked = await page.evaluate(() => {
  const f = document.querySelector('input[type=hidden][name="transport"]')?.closest("form");
  const b = [...f.querySelectorAll("button")].find(b => b.type === "submit" || /Confirm|Record/i.test(b.textContent));
  if (!b) return "NO BUTTON"; b.click(); return b.textContent.trim();
});
console.log("clicked:", clicked);
await new Promise(r=>setTimeout(r,5000));
const txt = await page.evaluate(() => document.body.innerText.replace(/\s+/g," "));
console.log("required-msg present:", /Transport is required/i.test(txt));
console.log("body slice:", txt.slice(0,600));
console.log("invoice after:", JSON.stringify(await prisma.invoice.findUnique({where:{id:target.id}, select:{amountPaid:true,status:true}})));
const pay = await prisma.payment.findMany({ where: { invoiceId: target.id }, select: { amount:true, creditedAmount:true, transportAmount:true } });
console.log("payments:", JSON.stringify(pay));
await browser.close(); await prisma.$disconnect();
