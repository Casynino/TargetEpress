/**
 * Support submits a claim from the CARGO PANEL and must be told it worked.
 *
 * She used to get nothing: the confirmation asked for a receipt number, which
 * only Finance's action returns. A desk that cannot tell whether it worked
 * presses again — and the second press is refused as a repeat of a claim
 * nobody told them about.
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
  return [...c1, ...r2.headers.getSetCookie()].map((c) => { const p = c.split(";")[0]; const i = p.indexOf("="); return { name: p.slice(0,i), value: p.slice(i+1), url: BASE }; }).filter(c=>c.name&&c.value);
}
const SET = `window.__set=(el,v)=>{let p=Object.getPrototypeOf(el),d=Object.getOwnPropertyDescriptor(p,"value");while(p&&!(d&&d.set)){p=Object.getPrototypeOf(p);d=p?Object.getOwnPropertyDescriptor(p,"value"):null;}if(d&&d.set)d.set.call(el,v);else el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};
window.__click=(re)=>{const b=[...document.querySelectorAll("button")].find(x=>new RegExp(re).test(x.innerText));if(b){b.click();return b.innerText.replace(/\\s+/g," ").slice(0,60);}return null;};`;

const inv = await prisma.invoice.findFirst({ where: { shipmentId: process.env.SHIPMENT_ID },
  select: { id: true, total: true, exchangeRate: true, shipment: { select: { trackingNumber: true } } } });
const billTsh = Math.round(Number(inv.total) * Number(inv.exchangeRate));
const paying = billTsh - 400;
console.log(`${inv.shipment.trackingNumber}: bill TSh ${billTsh.toLocaleString()}, Support types TSh ${paying.toLocaleString()}\n`);

const browser = await puppeteer.launch({ executablePath: CHROME, headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
page.on("dialog", (d) => d.accept());
await page.setViewport({ width: 1500, height: 1400 });
await page.setCookie(...(await cookies("support@targetexpress.co.tz")));
await page.goto(`${BASE}/app/cargo/${process.env.SHIPMENT_ID}`, { waitUntil: "networkidle2" });
await page.evaluate(SET);
await page.evaluate((v) => {
  const box = [...document.querySelectorAll("form input")].filter(i => i.type !== "hidden")
    .find(i => /^[\d,]+$/.test(i.value) && Number(i.value.replace(/,/g, "")) > 100);
  window.__set(box, String(v));
}, paying);
await wait(900);

const tick = await page.evaluate(() => window.__click("Clear the last"));
tick ? ok(`Support can press "${tick}"`) : bad("Support still has no Clear button on the cargo panel");
await wait(400);
const wording = await page.evaluate(() =>
  [...document.querySelectorAll("div")].filter(n => /will be settled/.test(n.textContent))
    .map(n => n.innerText.replace(/\s+/g," ")).pop() ?? null);
wording && /once Finance confirms/.test(wording)
  ? ok("and the wording says Finance decides, not her")
  : bad(`wording reads: ${wording}`);

await page.evaluate(() => {
  const sel = document.querySelector('select[name="accountId"]');
  if (sel) window.__set(sel, [...sel.options].find(o => o.value).value);
});
await wait(300);
const sent = await page.evaluate(() => window.__click("Send to Finance|Submit to Finance|Record it"));
console.log(`   pressed: ${sent}`);
await wait(6000);

const banner = await page.evaluate(() => document.body.innerText.replace(/\s+/g," ").match(/Sent to Finance[^]{0,110}/)?.[0] ?? null);
banner ? ok(`she is told: "${banner.slice(0, 105)}"`) : bad("still no confirmation after submitting");

const claim = await prisma.paymentSubmission.findFirst({ where: { invoiceId: inv.id },
  orderBy: { submittedAt: "desc" }, select: { submissionNumber: true, clearShortfall: true, amount: true } });
claim ? ok(`claim ${claim.submissionNumber} for ${claim.amount}, tick=${claim.clearShortfall}`) : bad("no claim raised");
claim?.clearShortfall ? ok("her answer travelled on it") : bad("the tick did not travel");

await browser.close();
await prisma.$disconnect();
