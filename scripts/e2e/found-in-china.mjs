/**
 * DAR SAYS IT IS MISSING; GUANGZHOU IS HOLDING IT.
 *
 * The commonest ending a missing-cargo case has, and the one desk that could
 * see it was the one desk that could do nothing. The box must go back to the
 * loading table — same tracking number, same history — WITHOUT anybody
 * claiming it reached Dar.
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

const model=await prisma.shipment.findFirst({where:{status:"RECEIVED_AT_DAR"}});
const stamp=Date.now().toString().slice(-6);
const batch=await prisma.batch.create({data:{batchNumber:`ZZ-${stamp}`,origin:model.origin,status:"ARRIVED",departedAt:new Date(),arrivedAt:new Date(),createdById:model.createdById}});
const ship=await prisma.shipment.create({data:{
  trackingNumber:`TX-C${stamp}`, qrToken:`qr-c${stamp}`, customerId:model.customerId,
  cargoCategory:model.cargoCategory, cargoTypeId:model.cargoTypeId, goodsType:model.goodsType,
  description:"Found-in-China test", packages:1, packageType:model.packageType,
  weightKg:new Prisma.Decimal(4), origin:model.origin, status:"UNDER_INVESTIGATION",
  batchId:batch.id, createdById:model.createdById, registeredAt:new Date(), departedAt:new Date(),
  packageList:{create:[{sequence:1,qrToken:`qr-c${stamp}-1`,reference:`TX-C${stamp}-P1`}]}}});
const exc=await prisma.shipmentException.create({data:{shipmentId:ship.id,batchId:batch.id,
  type:"MISSING_SHIPMENT",status:"OPEN",description:"Nothing with this label came off the flight."}});
console.log(`Dar reported ${ship.trackingNumber} missing off ${batch.batchNumber}\n`);

const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await b.newPage(); page.on("dialog",d=>d.accept());
await page.setViewport({width:1500,height:1300});
await page.setCookie(...(await cookies("china@targetexpress.co.tz")));
await page.goto(`${BASE}/app/exceptions`,{waitUntil:"networkidle2"}); await wait(2400);
const sees = await page.evaluate((tx)=>document.body.innerText.includes(tx), ship.trackingNumber);
sees ? ok("Guangzhou can see the case") : bad("China cannot see the case at all");

await page.evaluate((tx)=>{const el=[...document.querySelectorAll("tr,li")].find(e=>e.textContent.includes(tx));const btn=el&&[...el.querySelectorAll("button")].find(x=>/Show case detail|查看案件详情/i.test(x.innerText));btn&&btn.click();}, ship.trackingNumber);
await wait(1500);
const all = await page.evaluate(()=>[...document.querySelectorAll("button")].map(x=>x.innerText.replace(/\s+/g," ").trim()).filter(Boolean));
console.log(`   every button China sees: ${JSON.stringify(all)}`);
const hasNext = await page.evaluate(()=>/What happens next|接下来/.test(document.body.innerText));
console.log(`   "What happens next" block present: ${hasNext}`);

const foundBtn = all.find(t=>/Found in China|在中国找到/.test(t));
foundBtn ? ok(`"Found in China" is offered to Guangzhou — shown as "${foundBtn.slice(0,40)}"`) : bad("no Found in China button");
all.some(o=>/^Cargo found|^货物已找到/.test(o)) ? bad("China is also offered the Dar 'Cargo found' — it would claim a Dar arrival") : ok("and NOT the Dar 'Cargo found', which would claim an arrival");

await page.evaluate(()=>{const b=[...document.querySelectorAll("button")].find(x=>/Found in China|在中国找到/.test(x.innerText));b&&b.click();});
await wait(1200);
await page.evaluate(()=>{const ta=[...document.querySelectorAll("textarea")].pop();if(ta){const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ta),"value");d.set.call(ta,"On rack C4 in Guangzhou — it was never loaded.");ta.dispatchEvent(new Event("input",{bubbles:true}));}});
await wait(500);
const formState = await page.evaluate(()=>{
  const f=[...document.querySelectorAll("form")].find(x=>x.querySelector("textarea"));
  if(!f) return {form:false, buttons:[...document.querySelectorAll("button")].map(x=>x.innerText.replace(/\s+/g," ").trim()).filter(Boolean)};
  return {form:true, textareas:f.querySelectorAll("textarea").length,
    buttons:[...f.querySelectorAll("button")].map(x=>({t:x.innerText.replace(/\s+/g," ").trim(),d:x.disabled}))};
});
console.log(`   after pressing: ${JSON.stringify(formState)}`);
/* The submit carries the step's own name; the other button is Cancel. */
await page.evaluate(()=>{const f=[...document.querySelectorAll("form")].find(x=>x.querySelector("textarea"));const btn=f&&[...f.querySelectorAll("button")].find(x=>!x.disabled&&!/取消|Cancel/i.test(x.innerText));btn&&btn.click();});
await wait(7000);
const err = await page.evaluate(()=>[...document.querySelectorAll("p,div")].map(e=>e.innerText).find(t=>t&&t.length<240&&/无法|错误|not|cannot|refus|failed|权限|案件/i.test(t))?.replace(/\s+/g," ") ?? null);
if (err) console.log(`   screen says: ${err.slice(0,200)}`);

const after=await prisma.shipment.findUnique({where:{id:ship.id},
  select:{status:true,batchId:true,arrivedAt:true,departedAt:true,trackingNumber:true,
    packageList:{select:{receivedAt:true}},
    statusHistory:{orderBy:{createdAt:"desc"},take:1,select:{toStatus:true,location:true,note:true}}}});
const ex=await prisma.shipmentException.findUnique({where:{id:exc.id},select:{status:true,resolutionNote:true}});
console.log();
console.log(`   ${after.trackingNumber}: ${after.status}, batch ${after.batchId ?? "none"}, arrivedAt ${after.arrivedAt ?? "null"}`);
console.log(`   last history: ${after.statusHistory[0]?.toStatus} @ ${after.statusHistory[0]?.location} — ${after.statusHistory[0]?.note}`);
console.log(`   case: ${ex.status}`);
after.status === "READY_TO_DEPART" ? ok("back on the loading table, ready for the next flight") : bad(`status is ${after.status}`);
after.batchId === null ? ok("off the flight it never flew on") : bad("still manifested on the old flight");
after.arrivedAt === null ? ok("no Dar arrival was claimed") : bad("it claims to have arrived in Dar");
after.packageList.every(p=>!p.receivedAt) ? ok("no box was ticked as received") : bad("a box was ticked received in a warehouse 8,000 km away");
after.statusHistory[0]?.location === "Guangzhou warehouse" ? ok("the history line says Guangzhou") : bad(`history says ${after.statusHistory[0]?.location}`);
ex.status === "CARGO_FOUND" ? ok(`the case is Solved — "${ex.resolutionNote}"`) : bad(`case is ${ex.status}`);
after.trackingNumber === ship.trackingNumber ? ok("same tracking number, no new record") : bad("the tracking number changed");

await b.close();
await prisma.shipmentException.delete({where:{id:exc.id}}).catch(()=>{});
await prisma.shipment.delete({where:{id:ship.id}}).catch(()=>{});
await prisma.batch.delete({where:{id:batch.id}}).catch(()=>{});
await prisma.$disconnect();
