/**
 * CANCEL A MERGED PAYMENT THAT HAD A SHORTFALL WRITTEN OFF.
 *
 * The owner's question, twice asked: does the bill go back to its full price?
 * The money and the forgiveness were one decision, so cancelling has to undo
 * both — otherwise the bill returns owing 67.48 minus a 0.02 nobody granted.
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

const RCT = process.argv[2];
const pay = await prisma.payment.findFirst({ where: { receipt: { receiptNumber: RCT } },
  select: { id:true, allocations:{ select:{ invoiceId:true } } } });
const ids = pay.allocations.map(a=>a.invoiceId);
const before = await prisma.invoice.findMany({ where:{ id:{ in: ids } },
  select:{ status:true, total:true, amountPaid:true, amountAdjusted:true, shipment:{select:{trackingNumber:true}} } });
console.log(`before cancelling ${RCT}:`);
for (const i of before) console.log(`   ${i.shipment.trackingNumber}  ${i.status.padEnd(14)} due ${i.total} paid ${i.amountPaid} cleared ${i.amountAdjusted}`);

const browser=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await browser.newPage(); page.on("dialog",d=>d.accept());
await page.setViewport({width:1500,height:1400});
await page.setCookie(...(await cookies("finance@targetexpress.co.tz")));
await page.goto(`${BASE}/app/finance/transactions`,{waitUntil:"networkidle2"});
await wait(1500);

// open the row's correction dialog
const opened = await page.evaluate((rct)=>{
  const row=[...document.querySelectorAll("tr,li,div")].reverse().find(e=>e.textContent.includes(rct)&&e.querySelector("button"));
  if(!row) return "no row";
  const btns=[...row.querySelectorAll("button")];
  const b=btns.find(x=>/fix|correct|cancel|⋯|…/i.test(x.innerText+x.getAttribute("aria-label")));
  if(!b) return "row but no button: "+btns.map(x=>x.innerText||x.getAttribute("aria-label")).join("|");
  b.click(); return "opened via "+(b.innerText||b.getAttribute("aria-label"));
}, RCT);
console.log(`   ${opened}`);
await wait(1200);
const cancelled = await page.evaluate(()=>{
  const b=[...document.querySelectorAll("button")].find(x=>/^Cancel this payment|^Cancel payment|^Cancel the payment/i.test(x.innerText.trim()));
  if(!b) return [...document.querySelectorAll("button")].map(x=>x.innerText.trim()).filter(Boolean).join(" | ").slice(0,300);
  b.click(); return "pressed: "+b.innerText.trim();
});
console.log(`   ${cancelled}`);
await wait(1200);
const confirmed = await page.evaluate(()=>{
  const b=[...document.querySelectorAll("button")].find(x=>/^(Yes|Confirm|Cancel it|Cancel the payment)/i.test(x.innerText.trim()));
  if(b){b.click();return "confirmed: "+b.innerText.trim();}
  return "no confirm step";
});
console.log(`   ${confirmed}`);
await wait(5000);

const after = await prisma.invoice.findMany({ where:{ id:{ in: ids } },
  select:{ status:true, total:true, amountPaid:true, amountAdjusted:true, shipment:{select:{trackingNumber:true}} } });
console.log(`\nafter:`);
for (const i of after) console.log(`   ${i.shipment.trackingNumber}  ${i.status.padEnd(14)} due ${i.total} paid ${i.amountPaid} cleared ${i.amountAdjusted}`);
after.every(i=>Number(i.amountPaid)===0) ? ok("the money is off both bills") : bad("money still attached");
after.every(i=>Number(i.amountAdjusted)===0) ? ok("and so is the write-off — both back at full price") : bad("the write-off stayed behind");
after.every(i=>i.status==="UNPAID") ? ok("both bills read UNPAID again") : bad("a bill is not UNPAID");
const adj = await prisma.invoiceAdjustment.findMany({ where:{ paymentId: pay.id }, select:{ reversedAt:true, reversalReason:true } });
adj.every(a=>a.reversedAt) ? ok(`the adjustment is reversed, not deleted — "${adj[0]?.reversalReason}"`) : bad("adjustment left live");
await browser.close(); await prisma.$disconnect();
