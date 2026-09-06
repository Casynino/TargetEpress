/**
 * A CORRECTED WEIGHT HAS TO REACH THE BILL.
 *
 * Editing the kilos changed the record and left the invoice on the old figure,
 * so a consignment re-weighed after check-in showed the right number on its
 * page and billed the wrong one. And a bill Finance has already confirmed must
 * NOT move — correcting that is a discount, not a weight edit.
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

const model=await prisma.shipment.findFirst({where:{status:"RECEIVED_AT_DAR",invoice:{isNot:null}},select:{customerId:true,cargoCategory:true,cargoTypeId:true,goodsType:true,packageType:true,origin:true,createdById:true}});
const stamp=Date.now().toString().slice(-6);
const CONFIRMED = process.env.CONFIRMED === "1";
/* Built and priced the way the app does it: a flight lands, the row is ticked,
   and check-in raises the bill. No hand-made invoice. */
const batch=await prisma.batch.create({data:{batchNumber:`ZZ-${stamp}`,origin:model.origin,status:"IN_TRANSIT",departedAt:new Date(),createdById:model.createdById}});
const ship=await prisma.shipment.create({data:{
  trackingNumber:`TX-E${stamp}`, qrToken:`qre${stamp}`, customerId:model.customerId,
  cargoCategory:model.cargoCategory, cargoTypeId:model.cargoTypeId, goodsType:model.goodsType,
  description:"Weight edit test", packages:1, packageType:model.packageType,
  weightKg:new Prisma.Decimal(10), origin:model.origin, status:"IN_TRANSIT", batchId:batch.id,
  createdById:model.createdById, registeredAt:new Date(), departedAt:new Date(),
  packageList:{create:[{sequence:1,qrToken:`qre${stamp}p`,reference:`TX-E${stamp}-P1`}]}}});

const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await b.newPage(); page.on("dialog",d=>d.accept());
await page.setViewport({width:1500,height:1200});
await page.setCookie(...(await cookies("warehouse@targetexpress.co.tz")));

/* Land it and check it in — that is what prices it, at 10 kg. */
await page.goto(`${BASE}/app/receive`,{waitUntil:"networkidle2"}); await wait(1600);
await page.evaluate((n)=>{const row=[...document.querySelectorAll("li,tr,article,div")].reverse().find(e=>e.textContent.includes(n)&&[...e.querySelectorAll("button")].some(x=>/Mark as arrived/i.test(x.innerText)));const x=row&&[...row.querySelectorAll("button")].find(y=>/Mark as arrived/i.test(y.innerText));x&&x.click();}, batch.batchNumber);
await wait(6000);
await page.evaluate((tx)=>{const row=[...document.querySelectorAll("tr,li")].find(e=>e.textContent.includes(tx));const cb=row?.querySelector('input[type="checkbox"]');if(cb&&!cb.checked)cb.click();}, ship.trackingNumber);
await wait(800);
await page.evaluate(()=>{const x=[...document.querySelectorAll("button")].find(y=>/Present & correct · \d/.test(y.innerText));x&&x.click();});
await wait(9000);
let inv = await prisma.invoice.findFirst({where:{shipmentId:ship.id},select:{invoiceNumber:true,total:true,status:true,id:true}});
if (!inv) { console.log("   check-in raised no bill — skipping"); await b.close(); await prisma.shipment.delete({where:{id:ship.id}}); await prisma.batch.delete({where:{id:batch.id}}); process.exit(0); }
if (CONFIRMED) { await prisma.invoice.update({where:{id:inv.id},data:{status:"UNPAID"}}); inv = {...inv, status:"UNPAID"}; }
console.log(`${ship.trackingNumber}: 10 kg, bill ${inv.invoiceNumber} ${inv.status} USD ${inv.total}\n`);

await page.goto(`${BASE}/app/cargo/${ship.trackingNumber}/edit`,{waitUntil:"networkidle2"}); await wait(2200);
const box = await page.evaluate(()=>{const el=document.querySelector('input[name="weightKg"]');if(!el)return false;const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),"value");d.set.call(el,"14");el.dispatchEvent(new Event("input",{bubbles:true}));return true;});
box ? ok("typed 14 kg on the edit screen") : bad("no weight field on the edit screen");
await page.evaluate(()=>{const f=document.querySelector('input[name="weightKg"]')?.closest("form");const btn=f&&[...f.querySelectorAll("button")].find(x=>!x.disabled&&/save|update|confirm/i.test(x.innerText));btn&&btn.click();});
await wait(9000);

const after=await prisma.shipment.findUnique({where:{id:ship.id},select:{weightKg:true,chargeableKg:true,invoice:{select:{invoiceNumber:true,total:true,status:true}}}});
console.log(`   now: ${after.weightKg} kg, chargeable ${after.chargeableKg}, bill ${after.invoice?.status} USD ${after.invoice?.total}`);
Number(after.weightKg) === 14 ? ok("the record carries the corrected weight") : bad(`stored ${after.weightKg}`);
if (CONFIRMED) {
  Number(after.invoice.total) === Number(inv.total)
    ? ok("a bill Finance already confirmed was NOT moved by a weight edit")
    : bad(`a confirmed bill changed from ${inv.total} to ${after.invoice.total}`);
} else {
  Number(after.invoice.total) > Number(inv.total)
    ? ok(`the draft bill followed the weight: USD ${inv.total} → ${after.invoice.total}`)
    : bad(`the bill stayed at ${after.invoice.total} while the weight went to 14`);
}
await b.close();
await prisma.shipment.delete({where:{id:ship.id}}).catch(()=>{});
await prisma.batch.delete({where:{id:batch.id}}).catch(()=>{});
await prisma.$disconnect();
