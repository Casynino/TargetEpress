/**
 * A DAR CLERK CAN REPORT THE FIVE NEW THINGS, AND THEY BEHAVE.
 *
 * The types existed in the schema before this and no user could reach any of
 * them: the check-in screen has its own list of answers, and it stopped at six.
 * So the test is not "does the enum have the value" but "can somebody standing
 * at the door pick it, and does the cargo then do the right thing".
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

/* A flight that has landed and still has cargo to check off. */
const batch = await prisma.batch.findFirst({
  where: { permanent: false, shipments: { some: { status: "IN_TRANSIT" } } },
  orderBy: { batchNumber: "asc" },
  select: { id: true, batchNumber: true,
    shipments: { where: { status: "IN_TRANSIT" }, select: { id: true, trackingNumber: true }, take: 3 } } });
if (!batch) { console.log("no landed batch with cargo left to receive — skipping"); process.exit(0); }
console.log(`${batch.batchNumber}, ${batch.shipments.length} consignment(s) to check off`);

const started = new Date();
const browser=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await browser.newPage(); page.on("dialog",d=>d.accept());
await page.setViewport({width:390,height:900,isMobile:true,hasTouch:true});
await page.setCookie(...(await cookies("warehouse@targetexpress.co.tz")));
/* Check-in only opens once the flight is marked landed, and that is its own
   screen — the receiving queue, where every in-transit flight is listed. */
await page.goto(`${BASE}/app/receive`,{waitUntil:"networkidle2"});
await wait(1800);
const arrived = await page.evaluate((n)=>{
  const row=[...document.querySelectorAll("li,tr,article,div")].reverse().find(e=>e.textContent.includes(n)&&[...e.querySelectorAll("button")].some(b=>/Mark as arrived/i.test(b.innerText)));
  const b=row&&[...row.querySelectorAll("button")].find(x=>/Mark as arrived/i.test(x.innerText));
  if(b){b.click();return true;}
  return false;
}, batch.batchNumber);
console.log(`   marked ${batch.batchNumber} arrived: ${arrived}`);
await wait(6000);

await page.goto(`${BASE}/app/receive/${batch.id}`,{waitUntil:"networkidle2"});
await wait(2000);

/* The panel only opens once the clerk says something is wrong on a row. */
const target = batch.shipments[0];
const opened = await page.evaluate((tx)=>{
  /* Identified by its own words AND its tracking number: the cargo-detail
     toggle also carries aria-expanded, and every row has one of each. */
  const b=[...document.querySelectorAll("button")].find(x=>{
    const s=(x.innerText||"")+" "+(x.textContent||"");
    return /Something is wrong/i.test(s) && s.includes(tx);
  });
  if(b){b.click();return b.textContent.replace(/\s+/g," ").trim().slice(0,44);}
  return false;
}, target.trackingNumber);
console.log(`   opened the flag panel: ${opened}`);
await wait(1500);

/* Every answer the screen offers. */
/* The picker is a radiogroup of buttons, not a select — one thumb, no
   dropdown, which is the right shape for a warehouse phone. */
const offered = await page.evaluate(()=>{
  const group=document.querySelector('[role="radiogroup"]');
  if(!group) return null;
  return [...group.querySelectorAll('[role="radio"]')].map(b=>({value:b.getAttribute("data-outcome")??b.innerText.replace(/\s+/g," ").trim(),text:b.innerText.replace(/\s+/g," ").trim()}));
});
if (!offered) {
  console.log("   selects on page:", await page.evaluate(()=>[...document.querySelectorAll("select")].map(s=>({name:s.name,id:s.id,opts:[...s.options].map(o=>o.value).slice(0,4)}))));
  console.log("   page text:", await page.evaluate(()=>document.body.innerText.replace(/\s+/g," ").slice(0,600)));
  bad("no outcome picker on the check-in screen"); await browser.close(); await prisma.$disconnect(); process.exit(1); }
console.log(`\n   the clerk is offered ${offered.length} answers:`);
for (const o of offered) console.log(`      ${o.value.padEnd(15)} ${o.text}`);
for (const [want,label] of [["SHORT_LANDED","Left in China"],["AT_CUSTOMS","Held by customs"],["NO_LABEL","No label"],["RESTRICTED","Restricted item"],["OVER_QUANTITY","More boxes"]]) {
  offered.some(o=>o.text===label) ? ok(`"${label}" can be picked`) : bad(`"${label}" (${want}) is NOT on the picker`);
}

/* Pick one for real and see what it does to the cargo. */
console.log(`\n   reporting SHORT_LANDED on ${target.trackingNumber}`);
const picked = await page.evaluate(()=>{
  const b=[...document.querySelectorAll('[role="radio"]')].find(x=>/Left in China/i.test(x.innerText));
  if(!b) return "not on the picker";
  b.click(); return "picked " + b.innerText.replace(/\s+/g," ").trim();
});
console.log(`   ${picked}`);
await wait(1200);
const hint = await page.evaluate(()=>[...document.querySelectorAll("p,span,label")].map(e=>e.innerText).find(t=>t&&/next flight|Left behind/i.test(t))?.replace(/\s+/g," ") ?? null);
hint ? ok(`the screen explains it: "${hint}"`) : bad("no hint shown for the new outcome");
await page.evaluate((tx)=>{
  const row=[...document.querySelectorAll("li,tr,div")].reverse().find(e=>e.textContent.includes(tx)&&e.querySelector("textarea"));
  const ta=row?.querySelector("textarea");
  if(ta){const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ta),"value");d.set.call(ta,"Offloaded in Guangzhou for weight, booked on the Friday flight.");ta.dispatchEvent(new Event("input",{bubbles:true}));}
}, target.trackingNumber);
await wait(600);
const saved = await page.evaluate(()=>{
  const b=[...document.querySelectorAll("button")].find(x=>/^Open a case/i.test(x.innerText.trim()));
  if(!b) return "no submit — buttons: " + [...document.querySelectorAll("button")].map(x=>x.innerText.replace(/\s+/g," ").trim()).filter(Boolean).slice(0,12).join(" | ");
  if(b.disabled) return "submit is disabled: " + b.innerText.replace(/\s+/g," ").trim();
  b.click(); return b.innerText.replace(/\s+/g," ").trim();
});
console.log(`   pressed: ${saved}`);
await wait(6000);

const exc = await prisma.shipmentException.findFirst({ where: { shipmentId: target.id, raisedAt: { gte: started } }, orderBy: { raisedAt: "desc" },
  select: { type: true, status: true, description: true } });
const ship = await prisma.shipment.findUnique({ where: { id: target.id }, select: { status: true } });
console.log();
exc ? ok(`a case was opened: ${exc.type} (${exc.status}) — "${exc.description}"`) : bad("no case was opened");
exc?.type === "SHORT_LANDED" ? ok("stored as SHORT_LANDED, not filed under MISSING") : bad(`stored as ${exc?.type}`);
console.log(`   the consignment now reads ${ship.status}`);
ship.status !== "RECEIVED_AT_DAR" ? ok("it was NOT marked received — nothing came off the plane") : bad("marked received though nothing arrived");
await browser.close(); await prisma.$disconnect();
