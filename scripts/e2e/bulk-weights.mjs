/**
 * WEIGH FORTY CARTONS, PRESS FINISH, AND KEEP THE FORTY FIGURES.
 *
 * Each row's tick carried its own weight. "Finish check-in" is a different
 * form and was blind to the boxes — so a clerk could weigh a whole manifest,
 * type every figure, press one button and have all of it priced on the weight
 * Guangzhou booked, with nothing on screen to say the typing was thrown away.
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

/* Three cartons on one flight, each booked at a round figure. */
const model=await prisma.shipment.findFirst({where:{status:"RECEIVED_AT_DAR"}});
const stamp=Date.now().toString().slice(-6);
const batch=await prisma.batch.create({data:{batchNumber:`ZZ-${stamp}`,origin:model.origin,status:"IN_TRANSIT",departedAt:new Date(),createdById:model.createdById}});
const BOOKED=[5,10,20], WEIGHED=[5.4,9.6,20];
const ships=[];
for (let i=0;i<3;i++) ships.push(await prisma.shipment.create({data:{
  trackingNumber:`TX-K${stamp}${i}`, qrToken:`qrk${stamp}${i}`, customerId:model.customerId,
  cargoCategory:model.cargoCategory, cargoTypeId:model.cargoTypeId, goodsType:model.goodsType,
  description:`Bulk weight ${i+1}`, packages:1, packageType:model.packageType,
  weightKg:new Prisma.Decimal(BOOKED[i]), origin:model.origin, status:"IN_TRANSIT", batchId:batch.id,
  createdById:model.createdById, registeredAt:new Date(), departedAt:new Date(),
  packageList:{create:[{sequence:1,qrToken:`qrk${stamp}${i}p`,reference:`TX-K${stamp}${i}-P1`}]}}}));
console.log(`${batch.batchNumber}: booked ${BOOKED.join(", ")} kg — the bench says ${WEIGHED.join(", ")}\n`);

const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await b.newPage(); page.on("dialog",d=>d.accept());
await page.setViewport({width:1500,height:1200});
await page.setCookie(...(await cookies("warehouse@targetexpress.co.tz")));
await page.goto(`${BASE}/app/receive`,{waitUntil:"networkidle2"}); await wait(1600);
await page.evaluate((n)=>{const row=[...document.querySelectorAll("li,tr,article,div")].reverse().find(e=>e.textContent.includes(n)&&[...e.querySelectorAll("button")].some(x=>/Mark as arrived/i.test(x.innerText)));const x=row&&[...row.querySelectorAll("button")].find(y=>/Mark as arrived/i.test(y.innerText));x&&x.click();}, batch.batchNumber);
await wait(6000);

/* Type all three, tick NONE of them. */
const typed = await page.evaluate((pairs)=>{
  let n=0;
  for (const [tx,kg] of pairs) {
    const row=[...document.querySelectorAll("tr,li")].find(e=>e.textContent.includes(tx));
    const box=row?.querySelector('input[name="weightKg"]');
    if(!box) continue;
    const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(box),"value");
    d.set.call(box,String(kg)); box.dispatchEvent(new Event("input",{bubbles:true})); n++;
  }
  return n;
}, ships.map((s,i)=>[s.trackingNumber, WEIGHED[i]]));
typed === 3 ? ok("typed all three scale readings, ticked nothing") : bad(`typed ${typed}`);

await page.evaluate(()=>{const x=[...document.querySelectorAll("button")].find(y=>/Finish check-in/i.test(y.innerText));x&&x.click();});
await wait(1200);
await page.evaluate(()=>{const d=document.querySelector('[role="dialog"]');const x=d&&[...d.querySelectorAll("button")].find(y=>/Yes, confirm/i.test(y.innerText));x&&x.click();});
await wait(12000);

console.log();
let good=0;
for (let i=0;i<3;i++) {
  const s=await prisma.shipment.findUnique({where:{id:ships[i].id},select:{weightKg:true,chargeableKg:true,status:true,invoice:{select:{total:true}}}});
  const hist=await prisma.fieldChange.findFirst({where:{entityId:ships[i].id,field:"weightKg"},select:{before:true,after:true}});
  const want=WEIGHED[i], moved=want!==BOOKED[i];
  const kept=Number(s.weightKg)===want;
  console.log(`   ${ships[i].trackingNumber}  booked ${BOOKED[i]} → stored ${s.weightKg}  billed USD ${s.invoice?.total ?? "—"}  history ${hist?`${hist.before}→${hist.after}`:"none"}`);
  if(kept) good++;
  if(moved && !hist) bad(`${ships[i].trackingNumber}: the correction left no history line`);
  if(!moved && hist) bad(`${ships[i].trackingNumber}: a history line for a weight nobody changed`);
}
good === 3 ? ok("all three were priced on the bench figure, not Guangzhou's") : bad(`${good} of 3 kept the typed weight`);
const st=await prisma.batch.findUnique({where:{id:batch.id},select:{status:true}});
st.status === "VERIFIED" ? ok("and the flight closed in the same press") : bad(`flight is ${st.status}`);

await b.close();
for (const s of ships) await prisma.shipment.delete({where:{id:s.id}}).catch(()=>{});
await prisma.batch.delete({where:{id:batch.id}}).catch(()=>{});
await prisma.$disconnect();
