/**
 * THE WHOLE CHECK-IN, THE WAY A DAR CLERK DOES IT.
 *
 * Mark arrived -> land straight on the check -> confirm once -> flight closed.
 * Counted in clicks, because the owner's complaint was the number of them.
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

const batch = await prisma.batch.findFirst({
  where: { permanent: false, status: "IN_TRANSIT", shipments: { some: { status: "IN_TRANSIT" } } },
  orderBy: { batchNumber: "asc" },
  select: { id: true, batchNumber: true, _count: { select: { shipments: true } } } });
if (!batch) { console.log("no in-transit flight to receive — skipping"); process.exit(0); }
console.log(`${batch.batchNumber}, ${batch._count.shipments} consignment(s)\n`);

const browser=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await browser.newPage(); page.on("dialog",d=>d.accept());
await page.setViewport({width:390,height:900,isMobile:true,hasTouch:true});
await page.setCookie(...(await cookies("warehouse@targetexpress.co.tz")));

let clicks = 0;
await page.goto(`${BASE}/app/receive`,{waitUntil:"networkidle2"});
await wait(1600);

/* 1. Mark as arrived. */
const pressed = await page.evaluate((n)=>{
  const row=[...document.querySelectorAll("li,tr,article,div")].reverse().find(e=>e.textContent.includes(n)&&[...e.querySelectorAll("button")].some(b=>/Mark as arrived/i.test(b.innerText)));
  const b=row&&[...row.querySelectorAll("button")].find(x=>/Mark as arrived/i.test(x.innerText));
  if(b){b.click();return true;} return false;
}, batch.batchNumber);
clicks++;
pressed ? ok("pressed Mark as arrived") : bad("no Mark as arrived button");
await wait(6000);

/* 2. Where did it land? */
const url = page.url();
console.log(`   landed on: ${url.replace(BASE,"")}`);
url.includes(`/app/receive/${batch.id}`)
  ? ok("straight onto the check — no hunting back through the queue")
  : bad(`still on ${url.replace(BASE,"")} — the clerk has to find the row again`);

/* 3. How many confirm controls are there? */
const controls = await page.evaluate(()=>[...document.querySelectorAll("button")].map(b=>b.innerText.replace(/\s+/g," ").trim()).filter(t=>/present & undamaged|Finish check-in|All \d+ present/i.test(t)));
console.log(`   confirm controls on the page: ${JSON.stringify(controls)}`);
controls.length === 1 ? ok("one confirm control, not two") : bad(`${controls.length} confirm controls`);

/* 4. Press it — the dialog must ask once. */
await page.evaluate(()=>{const b=[...document.querySelectorAll("button")].find(x=>/Finish check-in/i.test(x.innerText));if(b)b.click();});
clicks++;
await wait(1200);
const dialog = await page.evaluate(()=>{
  const d=document.querySelector('[role="dialog"]');
  if(!d) return null;
  return { text:d.innerText.replace(/\s+/g," "), buttons:[...d.querySelectorAll("button")].map(b=>b.innerText.trim()).filter(Boolean) };
});
dialog ? ok(`the dialog asks: "${dialog.text.slice(0,150)}"`) : bad("no confirmation dialog");
dialog && dialog.buttons.some(b=>/Cancel/i.test(b)) && dialog.buttons.some(b=>/Yes, confirm/i.test(b))
  ? ok(`its buttons are ${JSON.stringify(dialog.buttons.filter(b=>/Cancel|Yes/i.test(b)))}`)
  : bad(`buttons are ${JSON.stringify(dialog?.buttons)}`);
const typed = await page.evaluate(()=>!!document.querySelector('[role="dialog"] textarea, [role="dialog"] input[type="text"]'));
typed ? bad("it asks the clerk to type something") : ok("nothing to type — warn, confirm, done");

/* 5. Confirm. */
await page.evaluate(()=>{const d=document.querySelector('[role="dialog"]');const b=[...d.querySelectorAll("button")].find(x=>/Yes, confirm/i.test(x.innerText));if(b)b.click();});
clicks++;
await wait(9000);
const shown = await page.evaluate(()=>{
  const d=document.querySelector('[role="dialog"]');
  const err=[...document.querySelectorAll("p")].map(e=>e.innerText).find(t=>t&&/could not|cannot|refus|still|not yet|unresolved/i.test(t)&&t.length<220);
  return { dialogStillOpen: !!d, dialogText: d?d.innerText.replace(/\s+/g," ").slice(0,240):null, err: err?err.replace(/\s+/g," "):null };
});
if (shown.dialogStillOpen) console.log(`   dialog still open: ${shown.dialogText}`);
if (shown.err) console.log(`   page says: ${shown.err}`);

const after = await prisma.batch.findUnique({ where:{ id: batch.id }, select:{ status:true } });
console.log(`\n   ${batch.batchNumber} is now ${after.status}`);
after.status === "VERIFIED" ? ok("the flight closed in one pass") : bad(`the flight is ${after.status}`);
console.log(`   clicks from "arrived" to "closed": ${clicks}`);
clicks <= 3 ? ok("three clicks, no ceremony") : bad(`${clicks} clicks`);
await browser.close(); await prisma.$disconnect();
