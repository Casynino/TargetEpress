/**
 * THE DAR SCALE SETS THE BILL.
 *
 * China books 5.0 kg, the carton weighs 5.4 on the Dar bench. Until this, the
 * invoice was struck on China's figure — the code even said so in a comment,
 * "a bill raised against a weight nobody has put on a scale". The owner's rule
 * is that the scale wins, so the test is not "was the weight saved" but "what
 * does the customer's bill say".
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

/* A flight in the air with one carton on it, built from a real one so every
   column is shaped the way the app writes them. */
const model = await prisma.shipment.findFirst({ where: { status: "RECEIVED_AT_DAR" } });
const stamp = Date.now().toString().slice(-6);
const batch = await prisma.batch.create({ data: {
  batchNumber: `ZZ-${stamp}`, origin: model.origin, status: "IN_TRANSIT",
  departedAt: new Date(), createdById: model.createdById } });
const BOOKED = 5.0;
const ship = await prisma.shipment.create({ data: {
  trackingNumber: `TX-W${stamp}`, qrToken: `qr-w${stamp}`,
  customerId: model.customerId, cargoCategory: model.cargoCategory,
  cargoTypeId: model.cargoTypeId, goodsType: model.goodsType,
  description: "Scale test carton", packages: 1, packageType: model.packageType,
  weightKg: new Prisma.Decimal(BOOKED), origin: model.origin,
  status: "IN_TRANSIT", batchId: batch.id, createdById: model.createdById,
  registeredAt: new Date(), departedAt: new Date(),
  packageList: { create: [{ sequence: 1, qrToken: `qr-w${stamp}-1`, reference: `TX-W${stamp}-P1` }] } } });
console.log(`${batch.batchNumber} carries ${ship.trackingNumber}, booked at ${BOOKED} kg\n`);

const browser=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await browser.newPage(); page.on("dialog",d=>d.accept());
await page.setViewport({width:390,height:900,isMobile:true,hasTouch:true});
await page.setCookie(...(await cookies("warehouse@targetexpress.co.tz")));

await page.goto(`${BASE}/app/receive`,{waitUntil:"networkidle2"}); await wait(1600);
await page.evaluate((n)=>{const row=[...document.querySelectorAll("li,tr,article,div")].reverse().find(e=>e.textContent.includes(n)&&[...e.querySelectorAll("button")].some(b=>/Mark as arrived/i.test(b.innerText)));const b=row&&[...row.querySelectorAll("button")].find(x=>/Mark as arrived/i.test(x.innerText));b&&b.click();}, batch.batchNumber);
await wait(6000);
ok(`landed on ${page.url().replace(BASE,"")}`);

/* Type what the bench says, then the ordinary tick. */
const WEIGHED = process.env.UNCHANGED === "1" ? BOOKED : 5.4;
const typed = await page.evaluate((kg)=>{
  const box=document.querySelector('input[name="weightKg"]');
  if(!box) return false;
  const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box),"value");
  d.set.call(box,String(kg));
  box.dispatchEvent(new Event("input",{bubbles:true}));
  return true;
}, WEIGHED);
typed ? ok(process.env.UNCHANGED === "1" ? "left the box exactly as booked" : `typed ${WEIGHED} kg into the box on the row`) : bad("no weight box on the check-in row");
await page.evaluate(()=>{const b=[...document.querySelectorAll("button")].find(x=>/Present & correct/i.test(x.innerText));b&&b.click();});
await wait(9000);

const after = await prisma.shipment.findUnique({ where:{ id: ship.id },
  select:{ status:true, weightKg:true, chargeableKg:true, quotedAmount:true, currency:true,
    invoice:{ select:{ invoiceNumber:true, total:true, currency:true } } } });
console.log();
console.log(`   ${ship.trackingNumber}: ${after.status}, weight ${after.weightKg} kg, chargeable ${after.chargeableKg}`);
console.log(`   bill: ${after.invoice ? `${after.invoice.invoiceNumber} ${after.invoice.currency} ${after.invoice.total}` : "none"}`);
Number(after.weightKg) === WEIGHED ? ok("the stored weight is what the bench said") : bad(`stored ${after.weightKg}`);
after.invoice ? ok("a bill was raised at check-in") : bad("no bill was raised");
Number(after.chargeableKg) >= WEIGHED ? ok(`priced on ${after.chargeableKg} kg`) : bad(`priced on ${after.chargeableKg} kg`);

const hist = await prisma.fieldChange.findFirst({ where:{ entityId: ship.id, field: "weightKg" },
  select:{ before:true, after:true, actorName:true } });
if (process.env.UNCHANGED === "1") {
  hist ? bad(`a history line was written for a weight nobody changed: ${hist.before} → ${hist.after}`)
       : ok("no history line — nothing was corrected, so nothing is claimed");
} else {
  hist ? ok(`history kept: ${hist.before} → ${hist.after} by ${hist.actorName}`) : bad("the China weight was not kept");
}
const exc = await prisma.shipmentException.count({ where:{ shipmentId: ship.id } });
exc === 0 ? ok("and no case was opened — a re-weigh is not a problem") : bad(`${exc} case(s) opened by a re-weigh`);

await browser.close();
await prisma.shipment.delete({ where:{ id: ship.id } }).catch(()=>{});
await prisma.batch.delete({ where:{ id: batch.id } }).catch(()=>{});
await prisma.$disconnect();
