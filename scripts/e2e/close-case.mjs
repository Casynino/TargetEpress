/**
 * CLOSING A CASE WRITES THE WORD THE SYSTEM SAYS IT WRITES.
 *
 * lib/constants.ts calls RESOLVED a retired spelling "never written by new
 * code" — and every close written since had written it. Two words for one
 * outcome, and a migration one day facing three terminal spellings.
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

const ship=await prisma.shipment.findFirst({where:{status:"RECEIVED_AT_DAR",exceptions:{none:{}}},select:{id:true,trackingNumber:true}});
const exc=await prisma.shipmentException.create({data:{shipmentId:ship.id,type:"WRONG_ITEM",status:"OPEN",description:"Label says phone cases, box holds shoes."}});
console.log(`opened a wrong-item case on ${ship.trackingNumber}\n`);

const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await b.newPage(); page.on("dialog",d=>d.accept());
await page.setViewport({width:1500,height:1300});
await page.setCookie(...(await cookies("ceo@targetexpress.co.tz")));
await page.goto(`${BASE}/app/exceptions`,{waitUntil:"networkidle2"}); await wait(2200);

const words = await page.evaluate((tx)=>{
  const el=[...document.querySelectorAll("tr,li")].find(e=>e.textContent.includes(tx));
  return el?el.innerText.replace(/\s+/g," ").slice(0,200):null;
}, ship.trackingNumber);
console.log(`   the row reads: ${words}`);
/Open/.test(words ?? "") ? ok('a live case says "Open", not "Under investigation"') : bad("the new vocabulary is not showing");

/* Close it the way the app closes cases. */
/* The controls live inside the case detail, which is collapsed on the row. */
await page.evaluate((tx)=>{const el=[...document.querySelectorAll("tr,li")].find(e=>e.textContent.includes(tx));const b=el&&[...el.querySelectorAll("button")].find(x=>/Show case detail/i.test(x.innerText));b&&b.click();}, ship.trackingNumber);
await wait(1600);
const choices = await page.evaluate(()=>[...document.querySelectorAll("button")].map(x=>x.innerText.replace(/\s+/g," ").trim()).filter(Boolean).slice(0,26));
console.log(`   controls now on the page: ${JSON.stringify(choices)}`);
const opened = await page.evaluate(()=>{
  const b=[...document.querySelectorAll("button")].find(x=>/^Confirm resolution/i.test(x.innerText.trim()));
  if(b){b.click();return b.innerText.replace(/\s+/g," ").trim();}
  return "none matched";
});
console.log(`   pressed: ${opened}`);
await wait(1600);
await page.evaluate(()=>{const ta=document.querySelector("textarea");if(ta){const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ta),"value");d.set.call(ta,"Customer collected the correct goods; the mislabelled carton was returned to the supplier.");ta.dispatchEvent(new Event("input",{bubbles:true}));}});
await wait(600);
const form = await page.evaluate(()=>({
  radios:[...document.querySelectorAll('[role="radio"],input[type=radio]')].map(x=>x.innerText?.replace(/\s+/g," ").trim()||x.value).filter(Boolean),
  labels:[...document.querySelectorAll("label")].map(x=>x.innerText.replace(/\s+/g," ").trim()).filter(Boolean).slice(0,10),
  buttons:[...document.querySelectorAll("button")].map(x=>x.innerText.replace(/\s+/g," ").trim()).filter(Boolean).slice(8),
}));
console.log(`   the resolve form offers: ${JSON.stringify(form,null,1).slice(0,900)}`);
/* Say what happened, write it down, and confirm — the three things the form
   asks for, in the order a person answers them. */
await page.evaluate(()=>{const r=[...document.querySelectorAll('input[type=radio]')].find(x=>x.value==="OTHER");if(r)r.click();});
await wait(500);
await page.evaluate(()=>{const ta=[...document.querySelectorAll("textarea")].pop();if(ta){const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(ta),"value");d.set.call(ta,"Customer collected the correct goods; the mislabelled carton went back to the supplier.");ta.dispatchEvent(new Event("input",{bubbles:true}));}});
await wait(400);
await page.evaluate(()=>{const c=[...document.querySelectorAll('input[type=checkbox]')].find(x=>!x.checked);if(c)c.click();});
await wait(400);
const submitted = await page.evaluate(()=>{
  /* The submit is the "Confirm resolution" INSIDE the form — the one that
     revealed the form carries the same words. */
  const f=[...document.querySelectorAll("form")].find(x=>x.querySelector('input[type=radio][value="OTHER"]'));
  if(!f) return "form not found";
  const b=[...f.querySelectorAll("button")].filter(x=>!x.disabled).pop();
  if(b){b.click();return b.innerText.replace(/\s+/g," ").trim();}
  return "no button in the form";
});
console.log(`   submitted with: ${submitted}`);
await wait(7000);

const after=await prisma.shipmentException.findUnique({where:{id:exc.id},select:{status:true,resolutionType:true,resolvedAt:true}});
console.log(`\n   the case is now ${after.status}${after.resolutionType?` (${after.resolutionType})`:""}`);
after.status !== "RESOLVED" ? ok("the retired spelling is not written any more") : bad("still writing RESOLVED");
["CLOSED","CARGO_FOUND"].includes(after.status) ? ok(`closed as ${after.status}`) : bad(`unexpected ${after.status}`);
await b.close();
await prisma.shipmentException.delete({where:{id:exc.id}}).catch(()=>{});
await prisma.$disconnect();
