/**
 * MERGE PAYMENT, SHORT ACROSS TWO BILLS.
 *
 * The customer sends one transfer for two consignments and it is 50 shillings
 * light. The screen must offer the same one press the cargo page offers, take
 * the 50 off the larger bill, and settle both.
 */
import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";
const BASE="http://localhost:3177"; const PW=process.env.SEED_ADMIN_PASSWORD;
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prisma=new PrismaClient();
const ok=(m)=>console.log(`   ✓ ${m}`); const bad=(m)=>{console.log(`   ✗ ${m}`);process.exitCode=1;};
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
async function cookies(email){const r1=await fetch(`${BASE}/api/auth/csrf`);const c1=r1.headers.getSetCookie();const{csrfToken}=await r1.json();
const r2=await fetch(`${BASE}/api/auth/callback/credentials`,{method:"POST",redirect:"manual",headers:{"content-type":"application/x-www-form-urlencoded",cookie:c1.map(c=>c.split(";")[0]).join("; ")},body:new URLSearchParams({csrfToken,email,password:PW,redirect:"false"})});
return [...c1,...r2.headers.getSetCookie()].map(c=>{const p=c.split(";")[0];const i=p.indexOf("=");return{name:p.slice(0,i),value:p.slice(i+1),url:BASE};}).filter(c=>c.name&&c.value);}
const SET=`window.__set=(el,v)=>{let p=Object.getPrototypeOf(el),d=Object.getOwnPropertyDescriptor(p,"value");while(p&&!(d&&d.set)){p=Object.getPrototypeOf(p);d=p?Object.getOwnPropertyDescriptor(p,"value"):null;}if(d&&d.set)d.set.call(el,v);else el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};
window.__click=(re)=>{const b=[...document.querySelectorAll("button")].find(x=>new RegExp(re).test(x.innerText));if(b){b.click();return b.innerText.replace(/\\s+/g," ").slice(0,60);}return null;};`;

const bills = await prisma.invoice.findMany({
  where: { status: { in: ["UNPAID","PARTIALLY_PAID"] }, shipment: { status: "RECEIVED_AT_DAR" } },
  select: { id:true, total:true, amountPaid:true, amountAdjusted:true, exchangeRate:true, customerId:true,
    /* Both ways a bill can sit inside a live claim — see pendingClaimWhere.
       Reading only `submissions` misses every merged claim. */
    submissions: { where: { status: "PENDING" }, select: { id: true } },
    submissionAllocations: { where: { submission: { status: "PENDING" } }, select: { id: true } },
    shipment:{select:{trackingNumber:true}} } })
  /* A bill with a claim waiting on Finance is deliberately not tickable. */
  .then((rows) => rows.filter((r) => r.submissions.length === 0 && r.submissionAllocations.length === 0));
const byCustomer = new Map();
for (const b of bills) { const a = byCustomer.get(b.customerId) ?? []; a.push(b); byCustomer.set(b.customerId, a); }
const pair = [...byCustomer.entries()].find(([,v]) => v.length >= 2);
if (!pair) { console.log("need one customer with two landed unpaid bills"); process.exit(0); }
const [customerId, all] = pair;
const two = all.slice(0,2);
const ARM = process.env.ARM !== "0";
const rate = Number(two[0].exchangeRate);
const owed = two.reduce((s,b)=>s + Math.round((Number(b.total)-Number(b.amountPaid)-Number(b.amountAdjusted))*rate), 0);
const SHORT = 50; const sending = owed - SHORT;
const bigger = two.reduce((m,b)=> Number(b.total) > Number(m.total) ? b : m);
console.log(`two bills for one customer: ${two.map(b=>b.shipment.trackingNumber).join(" + ")}`);
console.log(`they come to TSh ${owed.toLocaleString()}, customer sends TSh ${sending.toLocaleString()} (${SHORT} short)`);
console.log(`the larger is ${bigger.shipment.trackingNumber} — the 50 should land there\n`);

const browser=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await browser.newPage(); page.on("dialog",d=>d.accept());
await page.setViewport({width:1500,height:1400});
await page.setCookie(...(await cookies("finance@targetexpress.co.tz")));
await page.goto(`${BASE}/app/finance/payments/new?customer=${customerId}`,{waitUntil:"networkidle2"});
await page.evaluate(SET); await wait(1500);

// tick the two bills
const ticked = await page.evaluate((tx)=>{let n=0;for(const t of tx){const row=[...document.querySelectorAll("label")].find(e=>e.textContent.includes(t)&&e.querySelector('input[type=checkbox]'));const cb=row?.querySelector('input[type=checkbox]');if(cb&&!cb.checked){cb.click();n++;}}return n;},two.map(b=>b.shipment.trackingNumber));
console.log(`   ticked ${ticked} bills`);
await wait(1200);

// type what actually arrived
await page.evaluate((v)=>{window.__set(document.getElementById("cargoShown"),String(v));}, sending);
await wait(1200);

const notice = await page.evaluate(()=>document.querySelector(".money-notice")?.innerText.replace(/\s+/g," ") ?? null);
notice ? ok(`the screen says: "${notice}"`) : bad("no shortfall notice — still the red over-allocation error?");
const err = await page.evaluate(()=>document.body.innerText.includes("You have put more against bills than the customer sent"));
err ? bad("the red over-allocation error is still showing") : ok("no over-allocation error");

if (ARM) {
  const pressed = await page.evaluate(()=>window.__click("Clear it"));
  pressed ? ok(`pressed "${pressed}"`) : bad("no Clear it button");
  await wait(700);
} else {
  const caption = await page.evaluate(()=>[...document.querySelectorAll("p")].map(p=>p.innerText).find(t=>/Left owing on|Taken off/.test(t)) ?? null);
  caption ? ok(`without pressing, it says: "${caption.replace(/\s+/g," ")}"`) : bad("no caption naming the bill left short");
}
const disabled = await page.evaluate(()=>[...document.querySelectorAll("button")].find(b=>/^Record/.test(b.innerText))?.disabled ?? null);
disabled === false ? ok("the Record button is live") : bad("Record is still disabled");
const sent = await page.evaluate(()=>({ allocations: document.querySelector('input[name=allocations]')?.value, named: document.querySelector('input[name=clearShortfallInvoiceId]')?.value, flag: document.querySelector('input[name=clearShortfall]')?.value, amount: document.querySelector('input[name=amount]')?.value }));
console.log(`   allocations sent: ${sent.allocations}`);
console.log(`   named bill: ${sent.named === bigger.id ? "the larger one ✓" : sent.named}`);
const allocSum = JSON.parse(sent.allocations ?? "[]").reduce((s,a)=>s+a.amount,0);
allocSum === Number(sent.amount) ? ok(`allocations total ${allocSum} = what arrived`) : bad(`allocations ${allocSum} vs amount ${sent.amount}`);

await page.evaluate(()=>{const sel=document.querySelector('select[name=accountId]');if(sel)window.__set(sel,[...sel.options].find(o=>o.value).value);});
await wait(400);
await page.evaluate(()=>window.__click("^Record"));
await wait(7000);

const after = await prisma.invoice.findMany({ where:{ id:{ in: two.map(b=>b.id) } },
  select:{ status:true, total:true, amountPaid:true, amountAdjusted:true, shipment:{select:{trackingNumber:true}} } });
console.log();
for (const i of after) console.log(`   ${i.shipment.trackingNumber}  ${i.status.padEnd(14)} due ${i.total} paid ${i.amountPaid} cleared ${i.amountAdjusted}`);
const cleared = after.reduce((s,i)=>s+Number(i.amountAdjusted),0);
const onBigger = after.find(i=>i.shipment.trackingNumber===bigger.shipment.trackingNumber);
const others = after.filter(i=>i!==onBigger);
if (ARM) {
  after.every(i=>i.status==="PAID") ? ok("both bills settled") : bad("a bill is still open");
  cleared > 0 ? ok(`written off in total: ${cleared}`) : bad("nothing was written off");
  Number(onBigger.amountAdjusted) > 0 ? ok("and it landed on the larger bill") : bad("it landed on the wrong bill");
} else {
  cleared === 0 ? ok("nothing written off, as nobody asked for it") : bad(`${cleared} written off without being armed`);
  others.every(i=>i.status==="PAID") ? ok("the other bill is settled in full") : bad("the other bill did not settle");
  onBigger.status === "PARTIALLY_PAID" ? ok("the larger bill is left part paid — the money is banked, the gap is still owed") : bad(`the larger bill is ${onBigger.status}`);
}
const led = await prisma.ledgerEntry.count({ where:{ sourceEntity:"InvoiceAdjustment" } });
led === 0 ? ok("no ledger line from any adjustment") : bad(`${led} ledger lines`);

await browser.close(); await prisma.$disconnect();
