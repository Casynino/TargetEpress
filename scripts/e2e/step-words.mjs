/**
 * THE STEP IS NAMED AFTER THE FAULT IN FRONT OF THE READER.
 *
 * Every case was offered "Cargo found — the boxes are back on the floor",
 * including cartons that were never anywhere else and consignments sitting in
 * a customs shed. What the step DOES is unchanged; only the sentence moves.
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

const CASES=[["HELD_BY_CUSTOMS","Cargo released"],["WRONG_ITEM","Contents sorted out"],["MISSING_SHIPMENT","Cargo found"]];
const made=[];
for (const [type] of CASES) {
  const ship=await prisma.shipment.findFirst({where:{status:"RECEIVED_AT_DAR",exceptions:{none:{}}},select:{id:true,trackingNumber:true}});
  if(!ship){console.log("ran out of clean cargo");break;}
  const e=await prisma.shipmentException.create({data:{shipmentId:ship.id,type,status:"OPEN",description:`Step wording check for ${type}.`}});
  made.push({...e, tracking: ship.trackingNumber});
}
const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await b.newPage(); await page.setViewport({width:1500,height:1300});
await page.setCookie(...(await cookies("ceo@targetexpress.co.tz")));
await page.goto(`${BASE}/app/exceptions`,{waitUntil:"networkidle2"}); await wait(2400);

for (const c of made) {
  const want = CASES.find(([t])=>t===c.type)[1];
  await page.evaluate((tx)=>{const el=[...document.querySelectorAll("tr,li")].find(e=>e.textContent.includes(tx));const btn=el&&[...el.querySelectorAll("button")].find(x=>/Show case detail/i.test(x.innerText));btn&&btn.click();}, c.tracking);
  await wait(1300);
  const offered = await page.evaluate(()=>[...document.querySelectorAll("button")].map(x=>x.innerText.replace(/\s+/g," ").trim()).filter(t=>/back on the floor|released|arrived|sorted out|identified|Cleared to release|accounted for|Cargo found/i.test(t)));
  const hit = offered.some(o=>o.startsWith(want));
  hit ? ok(`${c.type} is offered "${want}"`) : bad(`${c.type} offers ${JSON.stringify(offered)}`);
  await page.evaluate((tx)=>{const el=[...document.querySelectorAll("tr,li")].find(e=>e.textContent.includes(tx));const btn=el&&[...el.querySelectorAll("button")].find(x=>/Hide case detail/i.test(x.innerText));btn&&btn.click();}, c.tracking);
  await wait(700);
}
await b.close();
for (const c of made) await prisma.shipmentException.delete({where:{id:c.id}}).catch(()=>{});
await prisma.$disconnect();
