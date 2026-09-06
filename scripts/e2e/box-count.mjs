/**
 * MORE BOXES THAN WERE BOOKED.
 *
 * The manifest says 3, four cartons are on the pallet. The extra one is real,
 * it is usually somebody else's, and until now the screen had no way to say so
 * — there is no fourth row to tick. It must become a BOX, with its own QR, or
 * the warehouse is holding a carton the system cannot label or release.
 */
import puppeteer from "puppeteer-core";
import { PrismaClient, Prisma } from "@prisma/client";
const BASE="http://localhost:3177"; const PW=process.env.SEED_ADMIN_PASSWORD;
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prisma=new PrismaClient(); const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
const ok=(m)=>console.log(`   ✓ ${m}`); const bad=(m)=>{console.log(`   ✗ ${m}`);process.exitCode=1;};
async function cookies(email){const r1=await fetch(`${BASE}/api/auth/csrf`);const c1=r1.headers.getSetCookie();const{csrfToken}=await r1.json();
const r2=await fetch(`${BASE}/api/auth/callback/credentials`,{method:"POST",redirect:"manual",headers:{"content-type":"application/x-www-form-urlencoded",cookie:c1.map(c=>c.split(";")[0]).join("; ")},body:new URLSearchParams({csrfToken,email,password:PW,redirect:"false"})});
return [...c1,...r2.headers.getSetCookie()].map(c=>{const p=c.split(";")[0];const i=p.indexOf("=");return{name:p.slice(0,i),value:p.slice(i+1),url:BASE};}).filter(c=>c.name&&c.value);}

const BOOKED = 3, ARRIVED = 4;
const model = await prisma.shipment.findFirst({ where: { status: "RECEIVED_AT_DAR" } });
const stamp = Date.now().toString().slice(-6);
const batch = await prisma.batch.create({ data: { batchNumber:`ZZ-${stamp}`, origin: model.origin,
  status:"IN_TRANSIT", departedAt:new Date(), createdById: model.createdById } });
const ship = await prisma.shipment.create({ data: {
  trackingNumber:`TX-B${stamp}`, qrToken:`qr-b${stamp}`, customerId: model.customerId,
  cargoCategory: model.cargoCategory, cargoTypeId: model.cargoTypeId, goodsType: model.goodsType,
  description:"Box count test", packages: BOOKED, packageType: model.packageType,
  weightKg:new Prisma.Decimal(6), origin: model.origin, status:"IN_TRANSIT", batchId: batch.id,
  createdById: model.createdById, registeredAt:new Date(), departedAt:new Date(),
  packageList:{ create: Array.from({length:BOOKED},(_,i)=>({sequence:i+1,qrToken:`qr-b${stamp}-${i+1}`,reference:`TX-B${stamp}-P${i+1}`})) } } });
console.log(`${batch.batchNumber} carries ${ship.trackingNumber}, booked ${BOOKED} boxes\n`);

const browser=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await browser.newPage(); page.on("dialog",d=>d.accept());
await page.setViewport({width:390,height:900,isMobile:true,hasTouch:true});
await page.setCookie(...(await cookies("warehouse@targetexpress.co.tz")));
await page.goto(`${BASE}/app/receive`,{waitUntil:"networkidle2"}); await wait(1600);
await page.evaluate((n)=>{const row=[...document.querySelectorAll("li,tr,article,div")].reverse().find(e=>e.textContent.includes(n)&&[...e.querySelectorAll("button")].some(b=>/Mark as arrived/i.test(b.innerText)));const b=row&&[...row.querySelectorAll("button")].find(x=>/Mark as arrived/i.test(x.innerText));b&&b.click();}, batch.batchNumber);
await wait(6000);

await page.evaluate(()=>{const b=[...document.querySelectorAll("button")].find(x=>/Something is wrong/i.test((x.innerText||"")+(x.textContent||"")));b&&b.click();});
await wait(1400);
const LABEL = process.env.FEWER === "1" ? "Fewer boxes" : "More boxes";
const picked = await page.evaluate((L)=>{const b=[...document.querySelectorAll('[role="radio"]')].find(x=>x.innerText.trim()===L);if(!b)return false;b.click();return true;}, LABEL);
picked ? ok(`picked "${LABEL}"`) : bad(`${LABEL} is not on the picker`);
await wait(900);
const figures = await page.evaluate(()=>{const d=[...document.querySelectorAll("dl")].pop();return d?d.innerText.replace(/\s+/g," "):null;});
figures ? ok(`the screen shows: ${figures}`) : bad("no booked/arrived/difference figures");
if (process.env.FEWER === "1") {
  const unticked = await page.evaluate(()=>{const b=[...document.querySelectorAll('[aria-pressed="true"]')].pop();if(!b)return false;b.click();return true;});
  unticked ? ok("unticked the box that did not arrive") : bad("no box ticker to untick");
  await wait(700);
  console.log(`   after unticking: ${await page.evaluate(()=>{const d=[...document.querySelectorAll("dl")].pop();return d?d.innerText.replace(/\s+/g," "):null;})}`);
} else
await page.evaluate((n)=>{const box=document.querySelector('input[name="packagesArrived"]');const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box),"value");d.set.call(box,String(n));box.dispatchEvent(new Event("input",{bubbles:true}));box.dispatchEvent(new Event("change",{bubbles:true}));}, ARRIVED);
if (process.env.FEWER !== "1") { await wait(700);
console.log(`   after typing ${ARRIVED}: ${await page.evaluate(()=>{const d=[...document.querySelectorAll("dl")].pop();return d?d.innerText.replace(/\s+/g," "):null;})}`); }
await page.evaluate(()=>{const ta=document.querySelector("textarea");if(ta){const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ta),"value");d.set.call(ta,"Four cartons on the pallet, manifest says three. The extra has no label.");ta.dispatchEvent(new Event("input",{bubbles:true}));}});
await wait(500);
await page.evaluate(()=>{const b=[...document.querySelectorAll("button")].find(x=>/^Open a case/i.test(x.innerText.trim()));b&&!b.disabled&&b.click();});
await wait(8000);

const after = await prisma.shipment.findUnique({ where:{id:ship.id},
  select:{ packages:true, status:true, packageList:{ select:{ sequence:true, reference:true, qrToken:true, receivedAt:true }, orderBy:{sequence:"asc"} } } });
console.log();
console.log(`   ${ship.trackingNumber} now has ${after.packages} boxes, ${after.packageList.length} rows:`);
for (const b of after.packageList) console.log(`      ${b.sequence}  ${b.reference}  qr=${b.qrToken.slice(0,8)}…  ${b.receivedAt?"received":"not received"}`);
const exc = await prisma.shipmentException.findFirst({ where:{ shipmentId: ship.id }, select:{type:true,status:true} });
if (process.env.FEWER === "1") {
  after.packageList.length === BOOKED ? ok(`still ${BOOKED} rows — no box was destroyed`) : bad(`${after.packageList.length} rows`);
  const got = after.packageList.filter(b=>b.receivedAt).length;
  got === BOOKED - 1 ? ok(`${got} of ${BOOKED} checked in; the missing one is still owed`) : bad(`${got} received`);
  exc?.type === "PACKAGE_COUNT_MISMATCH" ? ok(`a case was opened: ${exc.type} (${exc.status})`) : bad(`case is ${exc?.type}`);
} else {
  after.packageList.length === ARRIVED ? ok(`${ARRIVED} real boxes exist, each with its own QR`) : bad(`${after.packageList.length} rows`);
  new Set(after.packageList.map(b=>b.qrToken)).size === ARRIVED ? ok("no two boxes share a QR") : bad("a QR is duplicated");
  after.packages === ARRIVED ? ok("the count matches the boxes") : bad(`count is ${after.packages}`);
  const hist = await prisma.fieldChange.findFirst({ where:{ entityId: ship.id, field:"packages" }, select:{before:true,after:true} });
  hist ? ok(`the booked figure is kept: ${hist.before} → ${hist.after}`) : bad("the booked count was not kept");
  exc?.type === "OVER_SHIPPED" ? ok(`a case was opened: ${exc.type} (${exc.status})`) : bad(`case is ${exc?.type}`);
}

await browser.close();
await prisma.shipment.delete({ where:{id:ship.id} }).catch(()=>{});
await prisma.batch.delete({ where:{id:batch.id} }).catch(()=>{});
await prisma.$disconnect();
