/**
 * WEIGH · COUNT · TYPE · OK.
 *
 * The owner's rule for this desk: China wrote a weight and a count when the
 * cargo was booked; Dar says what is really on the floor, types two numbers,
 * and the system does everything else — the difference, which way it went, and
 * the weight the bill is struck on.
 *
 * Nothing else may be asked for: no reason, no claim, no investigation and no
 * photograph.
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

const BOOKED_KG = 5, BOOKED_BOXES = 10;
const DAR_KG = Number(process.env.KG ?? 5.4);
const DAR_BOXES = Number(process.env.BOXES ?? 11);
const m=await prisma.shipment.findFirst({where:{status:"RECEIVED_AT_DAR"}});
const st=Date.now().toString().slice(-6);
const batch=await prisma.batch.create({data:{batchNumber:`ZZ-${st}`,origin:m.origin,status:"IN_TRANSIT",departedAt:new Date(),createdById:m.createdById}});
const ship=await prisma.shipment.create({data:{trackingNumber:`TX-V${st}`,qrToken:`qrv${st}`,customerId:m.customerId,cargoCategory:m.cargoCategory,cargoTypeId:m.cargoTypeId,goodsType:m.goodsType,description:"Dar verification",packages:BOOKED_BOXES,packageType:m.packageType,weightKg:new Prisma.Decimal(BOOKED_KG),origin:m.origin,status:"IN_TRANSIT",batchId:batch.id,createdById:m.createdById,registeredAt:new Date(),departedAt:new Date(),
  packageList:{create:Array.from({length:BOOKED_BOXES},(_,i)=>({sequence:i+1,qrToken:`qrv${st}-${i+1}`,reference:`TX-V${st}-P${i+1}`}))}}});
console.log(`${ship.trackingNumber}: China says ${BOOKED_KG} kg / ${BOOKED_BOXES} boxes — Dar finds ${DAR_KG} kg / ${DAR_BOXES}\n`);

const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await b.newPage(); page.on("dialog",d=>d.accept());
await page.setViewport({width:1500,height:1200});
await page.setCookie(...(await cookies("warehouse@targetexpress.co.tz")));
await page.goto(`${BASE}/app/receive`,{waitUntil:"networkidle2"}); await wait(1600);
await page.evaluate((n)=>{const row=[...document.querySelectorAll("li,tr,article,div")].reverse().find(e=>e.textContent.includes(n)&&[...e.querySelectorAll("button")].some(x=>/Mark as arrived/i.test(x.innerText)));const x=row&&[...row.querySelectorAll("button")].find(y=>/Mark as arrived/i.test(y.innerText));x&&x.click();}, batch.batchNumber);
await wait(6000);
page.url().includes(`/app/receive/${batch.id}`) ? ok("Mark as arrived lands straight on verification") : bad("did not open verification");

await page.evaluate(()=>{const x=[...document.querySelectorAll("button")].find(y=>/Correct the weight/i.test((y.innerText||"")+(y.getAttribute("title")||"")));x&&x.click();});
await wait(1300);
await page.evaluate((kg,bx)=>{
  const set=(n,v)=>{const el=document.querySelector(`input[name="${n}"]`);if(!el)return;const d=Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el),"value");d.set.call(el,String(v));el.dispatchEvent(new Event("input",{bubbles:true}));};
  set("weightKg",kg); set("packagesArrived",bx);
}, DAR_KG, DAR_BOXES);
await wait(1000);

const panel = await page.evaluate(()=>{const f=[...document.querySelectorAll("form")].find(x=>x.querySelector('input[name="weightKg"]'));return f?f.innerText.replace(/\s+/g," "):null;});
console.log(`   the panel reads: ${panel?.slice(0,190)}`);
/difference/i.test(panel??"") ? ok("it works the differences out itself") : bad("no difference shown");
const wantKg = Math.round((DAR_KG-BOOKED_KG)*100)/100, wantBx = DAR_BOXES-BOOKED_BOXES;
const sign=(n)=>n>0?`+${n}`:`−${Math.abs(n)}`;
(panel??"").includes(sign(wantKg)) ? ok(`weight difference reads ${sign(wantKg)} kg`) : bad(`expected ${sign(wantKg)} kg`);
(panel??"").includes(sign(wantBx)) ? ok(`box difference reads ${sign(wantBx)}`) : bad(`expected ${sign(wantBx)} boxes`);
/required|Photograph the scale/i.test(panel??"") ? bad("it still demands a photo") : ok("no photo demanded, no reason, no claim");

await page.evaluate(()=>{const f=[...document.querySelectorAll("form")].find(x=>x.querySelector('input[name="weightKg"]'));const btn=f&&[...f.querySelectorAll('button[type="submit"], button:not([type])')].find(x=>!x.disabled&&!/Cancel|取消|photo|照片/i.test(x.innerText));btn&&btn.click();});
await wait(10000);

const after=await prisma.shipment.findUnique({where:{id:ship.id},select:{status:true,weightKg:true,chargeableKg:true,packages:true,invoice:{select:{total:true}},packageList:{select:{receivedAt:true},orderBy:{sequence:"asc"}}}});
const got=after.packageList.filter(p=>p.receivedAt).length;
console.log(`\n   ${ship.trackingNumber}: ${after.status}, ${after.weightKg} kg, ${after.packages} boxes (${got} on the floor), bill USD ${after.invoice?.total ?? "—"}`);
Number(after.weightKg) === DAR_KG ? ok("the Dar weight is the stored weight") : bad(`stored ${after.weightKg}`);
Number(after.chargeableKg) >= DAR_KG ? ok(`priced on the Dar weight (${after.chargeableKg} kg)`) : bad(`priced on ${after.chargeableKg}`);
after.packages === DAR_BOXES ? ok(`the count is what Dar counted (${DAR_BOXES})`) : bad(`count is ${after.packages}`);
after.packageList.length === Math.max(BOOKED_BOXES, DAR_BOXES) ? ok("no box row was destroyed") : bad(`${after.packageList.length} rows`);
got === DAR_BOXES ? ok(`${got} boxes ticked onto the floor — exactly what was counted`) : bad(`${got} ticked`);
/* A weight that moved opens nothing — that is this desk doing its job. A box
   that did not arrive does open one, because a carton nobody can find must not
   be forgotten and the counter has to stay shut until it turns up. */
const cases=await prisma.shipmentException.findMany({where:{shipmentId:ship.id},select:{type:true}});
if (DAR_BOXES < BOOKED_BOXES) {
  cases.length === 1 && cases[0].type === "PACKAGE_COUNT_MISMATCH"
    ? ok("a case for the box that did not arrive — and only that")
    : bad(`cases: ${JSON.stringify(cases.map(c=>c.type))}`);
} else {
  cases.length === 0 ? ok("and no investigation was opened") : bad(`${cases.length} case(s) opened`);
}
const hist=await prisma.fieldChange.findMany({where:{entityId:ship.id},select:{field:true,before:true,after:true,actorName:true}});
console.log(`   history: ${hist.map(h=>`${h.field} ${h.before}→${h.after}`).join(", ")||"none"}`);
hist.some(h=>h.field==="weightKg") ? ok("the China weight is kept in the history") : bad("no weight history");

/* And the difference must be readable by the desks that review the cargo and
   its price, not only by the clerk who typed it. */
for (const who of ["finance","support","ceo"]) {
  const pg=await b.newPage(); await pg.setViewport({width:1400,height:900});
  await pg.setCookie(...(await cookies(`${who}@targetexpress.co.tz`)));
  await pg.goto(`${BASE}/app/cargo/${ship.trackingNumber}`,{waitUntil:"networkidle2"}); await wait(1800);
  const seen=await pg.evaluate(()=>{
    const hit=[...document.querySelectorAll("dd,p,span,div")].map(e=>e.innerText||"").find(t=>t.length<80&&/→/.test(t)&&/kg|boxes|件|公斤/i.test(t));
    return hit ? hit.replace(/\s+/g," ") : null;
  });
  if (!seen) console.log(`   ${who}: page text sample — ${await pg.evaluate(()=>document.body.innerText.replace(/\s+/g," ").slice(0,240))}`);
  seen ? ok(`${who} sees it on the cargo card: "${seen}"`) : bad(`${who} cannot see the difference`);
  await pg.close();
}

await b.close();
await prisma.shipment.delete({where:{id:ship.id}}).catch(()=>{});
await prisma.batch.delete({where:{id:batch.id}}).catch(()=>{});
await prisma.$disconnect();
