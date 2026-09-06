/**
 * EIGHTEEN OF TWENTY GO HOME; TWO ARE STILL CHASED.
 *
 * The counter refused the lot — everything paid for had to be present — so a
 * customer whose goods were standing in Kariakoo went home with nothing while
 * two cartons were chased across China. The owner's decision is to hand over
 * what arrived.
 *
 * What must NOT happen is the system claiming the customer has boxes nobody
 * has ever seen. That is the same lie the release gate exists to prevent, told
 * from the other side.
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

/* Three booked, two on the floor, one still missing — and a pickup note, so
   the only thing standing between the customer and their goods is the count. */
const model=await prisma.shipment.findFirst({where:{status:"RECEIVED_AT_DAR"}});
const staff=await prisma.user.findFirst({where:{email:"finance@targetexpress.co.tz"},select:{id:true}});
const stamp=Date.now().toString().slice(-6);
const ship=await prisma.shipment.create({data:{
  trackingNumber:`TX-P${stamp}`, qrToken:`qrp${stamp}`, customerId:model.customerId,
  cargoCategory:model.cargoCategory, cargoTypeId:model.cargoTypeId, goodsType:model.goodsType,
  description:"Part delivery test", packages:3, packageType:model.packageType,
  weightKg:new Prisma.Decimal(9), origin:model.origin, status:"READY_FOR_PICKUP",
  createdById:model.createdById, registeredAt:new Date(), departedAt:new Date(),
  arrivedAt:new Date(), readyForPickup:new Date(),
  packageList:{create:[1,2,3].map(i=>({sequence:i,qrToken:`qrp${stamp}${i}`,reference:`TX-P${stamp}-P${i}`,
    ...(i<3?{receivedAt:new Date(),receivedById:model.createdById}:{})}))}}});
const exc=await prisma.shipmentException.create({data:{shipmentId:ship.id,type:"PACKAGE_COUNT_MISMATCH",
  status:"OPEN",description:"Two of three cartons on the floor."}});
const note=await prisma.pickupNote.create({data:{
  noteNumber:`PN-T${stamp}`, shipment:{connect:{id:ship.id}}, customer:{connect:{id:model.customerId}}, status:"ACTIVE", issuedBy:{connect:{id:staff.id}}, amountPaid:new Prisma.Decimal(0) }});
console.log(`${ship.trackingNumber}: 3 booked, 2 on the floor, 1 missing — note ${note.noteNumber}\n`);

const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await b.newPage(); page.on("dialog",d=>d.accept());
await page.setViewport({width:430,height:930,isMobile:true,hasTouch:true});
await page.setCookie(...(await cookies("warehouse@targetexpress.co.tz")));
async function scan(code) {
  await page.goto(`${BASE}/app/scan`,{waitUntil:"networkidle2"});
  await wait(1800);
  await page.evaluate((c)=>{
    /* The "or type / paste the code" box, not one of the action fields. */
    const el=[...document.querySelectorAll('input[type="text"],input:not([type]),input[type="search"]')].find(i=>i.offsetParent!==null);
    if(!el) return "no box";
    const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),"value");
    d.set.call(el,c); el.dispatchEvent(new Event("input",{bubbles:true}));
    /* No form around it — the button beside it is the action. */
    const f=el.closest("form");
    if(f){ const btn=[...f.querySelectorAll("button")].find(b=>!b.disabled); if(btn){btn.click(); return "form btn "+btn.innerText.trim();} }
    const near=[...document.querySelectorAll("button")].filter(b=>!b.disabled&&/^Use$/i.test(b.innerText.trim()));
    if(near.length){ near[near.length-1].click(); return "btn "+near[near.length-1].innerText.replace(/\s+/g," ").trim(); }
    el.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
    return "enter";
  }, code);
  await wait(3200);
  if (process.env.DEBUG_SCAN === "1") {
    console.log("   scan page inputs:", await page.evaluate(()=>[...document.querySelectorAll("input")].map(i=>({n:i.name,id:i.id,t:i.type,v:i.value}))));
    console.log("   scan page buttons:", await page.evaluate(()=>[...document.querySelectorAll("button")].map(b=>b.innerText.replace(/\s+/g," ").trim()).filter(Boolean).slice(0,12)));
    console.log("   full text:", await page.evaluate(()=>document.body.innerText.replace(/\s+/g," ").slice(0,700)));
    console.log("   all inputs:", await page.evaluate(()=>[...document.querySelectorAll("input,textarea")].map(i=>({tag:i.tagName,n:i.name,id:i.id,t:i.type,ph:i.placeholder,vis:i.offsetParent!==null}))));
  }
}
await scan(`TXAC:S:${ship.qrToken}`);

const body = await page.evaluate(()=>document.body.innerText.replace(/\s+/g," "));
const hasForm = await page.evaluate(()=>!!document.querySelector('input[name="receiverName"]'));
hasForm ? ok("the counter opens on a short consignment") : bad(`the counter still refuses — "${body.slice(0,220)}"`);
const figures = await page.evaluate(()=>{const d=[...document.querySelectorAll("dl")].find(x=>/Booked/.test(x.innerText));return d?d.innerText.replace(/\s+/g," "):null;});
figures ? ok(`it shows ${figures}`) : bad("no booked/arrived/difference at the counter");

/* Try WITHOUT the tick first — the old refusal must still stand. */
await page.evaluate(()=>{
  const set=(n,v)=>{const el=document.querySelector(`[name="${n}"]`);if(el){const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),"value");d.set.call(el,v);el.dispatchEvent(new Event("input",{bubbles:true}));}};
  set("receiverName","Amina Juma"); set("receiverPhone","0712345678");
});
await wait(500);
await page.evaluate(()=>{const f=document.querySelector('input[name="receiverName"]')?.closest("form"); if(!f) return;const btn=[...f.querySelectorAll("button")].find(x=>!x.disabled&&/release|hand|confirm/i.test(x.innerText));btn&&btn.click();});
await wait(5000);
let after=await prisma.shipment.findUnique({where:{id:ship.id},select:{status:true}});
after.status === "READY_FOR_PICKUP" ? ok("without the tick it still refuses — nothing handed over") : bad(`it released anyway: ${after.status}`);

/* Now tick it: the customer agreed to take the two. */
await page.evaluate(()=>{const c=document.querySelector('input[name="partialAccepted"]');if(c&&!c.checked)c.click();});
await wait(500);
await page.evaluate(()=>{const f=document.querySelector('input[name="receiverName"]')?.closest("form"); if(!f) return;const btn=[...f.querySelectorAll("button")].find(x=>!x.disabled&&/release|hand|confirm/i.test(x.innerText));btn&&btn.click();});
await wait(7000);

const s1=await prisma.shipment.findUnique({where:{id:ship.id},
  select:{status:true,deliveredAt:true,packageList:{select:{sequence:true,receivedAt:true,deliveredAt:true},orderBy:{sequence:"asc"}},
    statusHistory:{orderBy:{createdAt:"desc"},take:1,select:{toStatus:true,location:true,note:true}}}});
const rec=await prisma.deliveryRecord.findUnique({where:{shipmentId:ship.id},select:{receiverName:true,note:true}});
const n1=await prisma.pickupNote.findUnique({where:{id:note.id},select:{status:true}});
const e1=await prisma.shipmentException.findUnique({where:{id:exc.id},select:{status:true}});
console.log();
for(const p of s1.packageList) console.log(`      P${p.sequence}  ${p.receivedAt?"arrived":"not here"}  ${p.deliveredAt?"handed over":"still with us"}`);
console.log(`   consignment ${s1.status}, note ${n1.status}, case ${e1.status}`);
console.log(`   signed record: ${rec?.receiverName} — "${rec?.note}"`);
s1.packageList.filter(p=>p.deliveredAt).length === 2 ? ok("the two that arrived went home") : bad(`${s1.packageList.filter(p=>p.deliveredAt).length} marked handed over`);
!s1.packageList.find(p=>p.sequence===3).deliveredAt ? ok("the box nobody has seen was NOT marked handed over") : bad("it claims the customer took a box that never arrived");
s1.status === "READY_FOR_PICKUP" ? ok("the consignment is not DELIVERED — the rest is still owed") : bad(`status is ${s1.status}`);
n1.status === "ACTIVE" ? ok("the note stays open for the return visit") : bad(`note is ${n1.status}`);
e1.status === "OPEN" ? ok("the case is still open, still being chased") : bad(`case is ${e1.status}`);
/Part delivery: 2 of 3/.test(rec?.note ?? "") ? ok("the signature says it was a part delivery") : bad("the signed record does not say so");

/* The third box turns up and the customer comes back. */
await prisma.package.updateMany({where:{shipmentId:ship.id,receivedAt:null},data:{receivedAt:new Date(),receivedById:model.createdById}});
await prisma.shipmentException.update({where:{id:exc.id},data:{status:"CLOSED",resolvedAt:new Date()}});
await scan(`TXAC:S:${ship.qrToken}`);
await page.evaluate(()=>{
  const set=(n,v)=>{const el=document.querySelector(`[name="${n}"]`);if(el){const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),"value");d.set.call(el,v);el.dispatchEvent(new Event("input",{bubbles:true}));}};
  set("receiverName","Amina Juma"); set("receiverPhone","0712345678");
});
await wait(500);
await page.evaluate(()=>{const f=document.querySelector('input[name="receiverName"]')?.closest("form");const btn=f&&[...f.querySelectorAll("button")].find(x=>!x.disabled&&/release|hand|confirm/i.test(x.innerText));btn&&btn.click();});
await wait(7000);
const s2=await prisma.shipment.findUnique({where:{id:ship.id},select:{status:true,packageList:{select:{deliveredAt:true}}}});
const n2=await prisma.pickupNote.findUnique({where:{id:note.id},select:{status:true}});
const rec2=await prisma.deliveryRecord.findUnique({where:{shipmentId:ship.id},select:{note:true}});
console.log(`\n   after the return visit: ${s2.status}, note ${n2.status}`);
s2.packageList.every(p=>p.deliveredAt) ? ok("all three boxes are now with the customer") : bad("a box is still unaccounted for");
s2.status === "DELIVERED" ? ok("only now is the consignment DELIVERED") : bad(`status is ${s2.status}`);
n2.status === "USED" ? ok("and the note is spent") : bad(`note is ${n2.status}`);
/Remaining/.test(rec2?.note ?? "") ? ok(`the one signed record tells the whole story: "${rec2.note}"`) : bad("the return visit is not on the record");

await b.close();
await prisma.deliveryRecord.deleteMany({where:{shipmentId:ship.id}});
await prisma.pickupNote.deleteMany({where:{shipmentId:ship.id}});
await prisma.shipmentException.deleteMany({where:{shipmentId:ship.id}});
await prisma.shipment.delete({where:{id:ship.id}}).catch(()=>{});
await prisma.$disconnect();
