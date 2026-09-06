/**
 * AN ARMFUL AT A TIME.
 *
 * Forty-six rows had two answers and needed three: tick one, accept every one,
 * or accept the ones you have actually walked past. The floor works in armfuls
 * — twenty before lunch, the rest after — and that had no button.
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
const batch=await prisma.batch.create({data:{batchNumber:`ZZ-${stamp}`,origin:model.origin,status:"IN_TRANSIT",departedAt:new Date(),createdById:model.createdById}});
const ships=[];
for (let i=0;i<5;i++) ships.push(await prisma.shipment.create({data:{
  trackingNumber:`TX-M${stamp}${i}`, qrToken:`qrm${stamp}${i}`, customerId:model.customerId,
  cargoCategory:model.cargoCategory, cargoTypeId:model.cargoTypeId, goodsType:model.goodsType,
  description:`Armful ${i+1}`, packages:1, packageType:model.packageType,
  weightKg:new Prisma.Decimal(3), origin:model.origin, status:"IN_TRANSIT", batchId:batch.id,
  createdById:model.createdById, registeredAt:new Date(), departedAt:new Date(),
  packageList:{create:[{sequence:1,qrToken:`qrm${stamp}${i}p`,reference:`TX-M${stamp}${i}-P1`}]}}}));
console.log(`${batch.batchNumber}: 5 consignments\n`);

const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await b.newPage(); page.on("dialog",d=>d.accept());
await page.setViewport({width:1500,height:1200});
await page.setCookie(...(await cookies("warehouse@targetexpress.co.tz")));
await page.goto(`${BASE}/app/receive`,{waitUntil:"networkidle2"}); await wait(1600);
await page.evaluate((n)=>{const row=[...document.querySelectorAll("li,tr,article,div")].reverse().find(e=>e.textContent.includes(n)&&[...e.querySelectorAll("button")].some(x=>/Mark as arrived/i.test(x.innerText)));const x=row&&[...row.querySelectorAll("button")].find(y=>/Mark as arrived/i.test(y.innerText));x&&x.click();}, batch.batchNumber);
await wait(6000);

/* Pick two of the five. */
const chose = await page.evaluate((tx)=>{
  let n=0;
  for (const t of tx) {
    const row=[...document.querySelectorAll("tr,li")].find(e=>e.textContent.includes(t));
    const cb=row?.querySelector('input[type="checkbox"]');
    if(cb&&!cb.checked){cb.click();n++;}
  }
  return n;
}, [ships[0].trackingNumber, ships[2].trackingNumber]);
chose === 2 ? ok("picked two of the five") : bad(`picked ${chose}`);
await wait(900);

const btn = await page.evaluate(()=>{const x=[...document.querySelectorAll("button")].find(y=>/Present & correct · \d/.test(y.innerText));return x?x.innerText.replace(/\s+/g," ").trim():null;});
btn ? ok(`a button appears: "${btn}"`) : bad("no button for the picked rows");
await page.evaluate(()=>{const x=[...document.querySelectorAll("button")].find(y=>/Present & correct · \d/.test(y.innerText));x&&x.click();});
await wait(9000);

const after=await prisma.shipment.findMany({where:{batchId:batch.id},select:{trackingNumber:true,status:true},orderBy:{trackingNumber:"asc"}});
const done=after.filter(s=>s.status==="RECEIVED_AT_DAR").map(s=>s.trackingNumber);
console.log(`\n   checked in: ${done.join(", ") || "none"}`);
done.length === 2 ? ok("exactly the two picked went in") : bad(`${done.length} went in`);
done.includes(ships[0].trackingNumber) && done.includes(ships[2].trackingNumber) ? ok("and they are the right two") : bad("the wrong ones went in");
const bat=await prisma.batch.findUnique({where:{id:batch.id},select:{status:true}});
bat.status === "ARRIVED" ? ok("the flight stays open for the rest — an armful is a pause, not the end") : bad(`flight is ${bat.status}`);

/* Now finish the remainder. */
await page.reload({waitUntil:"networkidle2"}); await wait(2200);
await page.evaluate(()=>{const x=[...document.querySelectorAll("button")].find(y=>/Finish check-in/i.test(y.innerText));x&&x.click();});
await wait(1200);
await page.evaluate(()=>{const d=document.querySelector('[role="dialog"]');const x=d&&[...d.querySelectorAll("button")].find(y=>/Yes, confirm/i.test(y.innerText));x&&x.click();});
await wait(10000);
const end=await prisma.batch.findUnique({where:{id:batch.id},select:{status:true}});
const all=await prisma.shipment.count({where:{batchId:batch.id,status:"RECEIVED_AT_DAR"}});
console.log(`   after Finish: flight ${end.status}, ${all} of 5 checked in`);
end.status === "VERIFIED" && all === 5 ? ok("Finish check-in closes the rest as before") : bad("the remainder did not close");

await b.close();
for (const s of ships) await prisma.shipment.delete({where:{id:s.id}}).catch(()=>{});
await prisma.batch.delete({where:{id:batch.id}}).catch(()=>{});
await prisma.$disconnect();
