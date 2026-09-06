/**
 * A BOX THAT HAS BEEN SCANNED IS NOT DELETED BY A NUMBER.
 *
 * Lowering a package count removes rows from the top down, which is right for
 * a booking Guangzhou is correcting before it flies. It is wrong the moment a
 * carton has been checked in: the row carries the proof somebody scanned it,
 * and a count edit would erase that quietly.
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

const m=await prisma.shipment.findFirst({where:{status:"RECEIVED_AT_DAR"}});
const s=Date.now().toString().slice(-6);
const sh=await prisma.shipment.create({data:{trackingNumber:`TX-G${s}`,qrToken:`qrg${s}`,customerId:m.customerId,cargoCategory:m.cargoCategory,cargoTypeId:m.cargoTypeId,goodsType:m.goodsType,description:"Count guard",packages:3,packageType:m.packageType,weightKg:new Prisma.Decimal(5),origin:m.origin,status:"RECEIVED_AT_DAR",createdById:m.createdById,registeredAt:new Date(),arrivedAt:new Date(),
  packageList:{create:[1,2,3].map(i=>({sequence:i,qrToken:`qrg${s}${i}`,reference:`TX-G${s}-P${i}`,...(i<=2?{receivedAt:new Date(),receivedById:m.createdById}:{})}))}}});
console.log(`${sh.trackingNumber}: 3 boxes — P1 and P2 checked in, P3 not\n`);

const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await b.newPage(); page.on("dialog",d=>d.accept());
await page.setViewport({width:1500,height:1200});
await page.setCookie(...(await cookies("warehouse@targetexpress.co.tz")));

async function setCount(n) {
  await page.goto(`${BASE}/app/cargo/${sh.trackingNumber}/edit`,{waitUntil:"networkidle2"}); await wait(2200);
  await page.evaluate((v)=>{const el=document.querySelector('input[name="packages"]');if(el){const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),"value");d.set.call(el,String(v));el.dispatchEvent(new Event("input",{bubbles:true}));}}, n);
  await wait(500);
  await page.evaluate(()=>{const f=document.querySelector('input[name="packages"]')?.closest("form");const btn=f&&[...f.querySelectorAll("button")].find(x=>!x.disabled&&/save|update|confirm/i.test(x.innerText));btn&&btn.click();});
  await wait(7000);
  return page.evaluate(()=>[...document.querySelectorAll("p,div")].map(e=>e.innerText).find(t=>t&&/already been checked in|cannot be lowered/i.test(t))?.replace(/\s+/g," ").slice(0,160) ?? null);
}

/* 3 → 1 walks over P2, which was scanned. */
const refusal = await setCount(1);
const afterBad = await prisma.shipment.findUnique({where:{id:sh.id},select:{packages:true,packageList:{select:{sequence:true}}}});
refusal ? ok(`refused: "${refusal}"`) : bad("no refusal shown");
afterBad.packageList.length === 3 ? ok("all three rows survive — no scanned box was destroyed") : bad(`${afterBad.packageList.length} rows left`);

/* 3 → 2 walks over P3 only, which nobody has touched. */
await setCount(2);
const afterGood = await prisma.shipment.findUnique({where:{id:sh.id},select:{packages:true,packageList:{select:{sequence:true,receivedAt:true},orderBy:{sequence:"asc"}}}});
console.log(`   after lowering to 2: ${afterGood.packageList.length} rows, count ${afterGood.packages}`);
afterGood.packageList.length === 2 ? ok("the untouched box came off cleanly") : bad(`${afterGood.packageList.length} rows`);
afterGood.packageList.every(p=>p.receivedAt) ? ok("and the two that were scanned are still there") : bad("a scanned box went missing");

await b.close();
await prisma.shipment.delete({where:{id:sh.id}}).catch(()=>{});
await prisma.$disconnect();
