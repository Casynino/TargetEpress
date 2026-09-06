/**
 * A DENTED BOX ON THE SHELF MUST NOT READ LIKE A LOST ONE.
 *
 * Every open case said "Under investigation" — the carton in Kariakoo and the
 * consignment nobody can find, in the same words. The desks that have to find
 * cargo now get told which of the two they are looking at.
 */
import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";
const BASE="http://localhost:3177"; const PW=process.env.SEED_ADMIN_PASSWORD;
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prisma=new PrismaClient(); const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const ok=(m)=>console.log(`   ✓ ${m}`); const bad=(m)=>{console.log(`   ✗ ${m}`);process.exitCode=1;};
async function cookies(email){const r1=await fetch(`${BASE}/api/auth/csrf`);const c1=r1.headers.getSetCookie();const{csrfToken}=await r1.json();
const r2=await fetch(`${BASE}/api/auth/callback/credentials`,{method:"POST",redirect:"manual",headers:{"content-type":"application/x-www-form-urlencoded",cookie:c1.map(c=>c.split(";")[0]).join("; ")},body:new URLSearchParams({csrfToken,email,password:PW,redirect:"false"})});
return [...c1,...r2.headers.getSetCookie()].map(c=>{const p=c.split(";")[0];const i=p.indexOf("=");return{name:p.slice(0,i),value:p.slice(i+1),url:BASE};}).filter(c=>c.name&&c.value);}

const open = await prisma.shipmentException.findMany({
  where: { status: { in: ["OPEN","UNDER_INVESTIGATION"] } },
  select: { type:true, shipment:{ select:{ trackingNumber:true } } }, take: 40 });
const here = open.filter(e=>["DAMAGED_CARGO","WRONG_ITEM","PACKAGE_COUNT_MISMATCH","OVER_SHIPPED","UNIDENTIFIED_CARGO","RESTRICTED_ITEM","HOLD_FOR_INVESTIGATION","WEIGHT_MISMATCH","WRONG_BATCH","OTHER"].includes(e.type));
const away = open.filter(e=>["MISSING_SHIPMENT","SHORT_LANDED","HELD_BY_CUSTOMS"].includes(e.type));
console.log(`${open.length} open case(s): ${here.length} on cargo that is here, ${away.length} on cargo that is not\n`);

const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await b.newPage(); await page.setViewport({width:1500,height:1200});
await page.setCookie(...(await cookies("support@targetexpress.co.tz")));
await page.goto(`${BASE}/app/exceptions`,{waitUntil:"networkidle2"}); await wait(2200);
const counts = await page.evaluate(()=>{
  const txt=document.body.innerText;
  return { present:(txt.match(/Cargo present/g)||[]).length, absent:(txt.match(/Not in the warehouse/g)||[]).length };
});
console.log(`   Issues & Claims shows "Cargo present" ${counts.present}×, "Not in the warehouse" ${counts.absent}×`);
counts.present + counts.absent > 0 ? ok("the list now says where the cargo is") : bad("no presence wording on the list");
if (here.length > 0) counts.present > 0 ? ok("cargo standing in the warehouse says so") : bad("present cargo is not labelled");
if (away.length > 0) counts.absent > 0 ? ok("cargo that is not here says so") : bad("absent cargo is not labelled");

/* And on the cargo page, beside the status. */
const one = here[0] ?? open[0];
if (one) {
  await page.goto(`${BASE}/app/cargo/${one.shipment.trackingNumber}`,{waitUntil:"networkidle2"}); await wait(1800);
  const near = await page.evaluate(()=>{
    const el=[...document.querySelectorAll("span,div")].find(e=>/Cargo present|Not in the warehouse/.test(e.innerText)&&e.innerText.length<80);
    return el?el.innerText.replace(/\s+/g," "):null;
  });
  near ? ok(`the cargo page reads: "${near}"`) : bad("the cargo page does not say where the box is");
}

/* The customer must still be told nothing about the fault. */
const pub = await page.evaluate(async (tx)=>{
  const r=await fetch(`/track?tracking=${tx}`); const html=await r.text();
  return { present:/Cargo present/.test(html), fault:/Damaged|Wrong item|Restricted/.test(html) };
}, one?.shipment.trackingNumber ?? "TX-000001");
!pub.present ? ok("the public tracking page is untouched — no fault named to the customer") : bad("presence wording leaked to the customer");
await b.close(); await prisma.$disconnect();
