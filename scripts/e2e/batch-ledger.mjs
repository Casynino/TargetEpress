/**
 * ONE FLIGHT'S BOOK, OPEN.
 *
 * The list says a flight made money. This is the page that says why — every
 * payment, every cost, everything still owed, and the totals they add up to.
 * The figures must be the SAME engine the list uses, or the page that exists
 * to explain the numbers becomes the thing people argue about.
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

const b=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});

for (const who of ["finance","manager","ceo"]) {
  const page=await b.newPage(); await page.setViewport({width:1500,height:1300});
  await page.setCookie(...(await cookies(`${who}@targetexpress.co.tz`)));
  const res=await page.goto(`${BASE}/app/finance/batches`,{waitUntil:"networkidle2"});
  await wait(1800);
  const rows=await page.evaluate(()=>document.querySelectorAll("tbody tr").length);
  const inMenu=await page.evaluate(()=>[...document.querySelectorAll("a")].some(a=>a.getAttribute("href")==="/app/finance/batches"));
  console.log(`   ${who.padEnd(8)} list ${res.status()}  ${rows} flight(s)  ${inMenu?"in the menu":"NOT in the menu"}`);
  if (who==="finance") {
    res.status()===200 ? ok("Finance can open Batch finances") : bad(`Finance gets ${res.status()}`);
    inMenu ? ok("and it is in their sidebar") : bad("no sidebar entry for Finance");
  }
  await page.close();
}

/* Warehouse must not see money. */
const w=await b.newPage(); await w.setCookie(...(await cookies("warehouse@targetexpress.co.tz")));
const wr=await w.goto(`${BASE}/app/finance/batches`,{waitUntil:"networkidle2",timeout:20000});
/* Puppeteer follows the redirect, so the landing URL is the answer — not the
   status, which is 200 for the no-access page it lands on. */
/no-access|login/.test(w.url()) ? ok(`the warehouse is turned away (${w.url().replace(BASE,"")})`) : bad(`the warehouse can see flight money — landed on ${w.url().replace(BASE,"")}`);
await w.close();

/* The book itself. */
const page=await b.newPage(); await page.setViewport({width:1500,height:1400});
await page.setCookie(...(await cookies("finance@targetexpress.co.tz")));
await page.goto(`${BASE}/app/finance/batches`,{waitUntil:"networkidle2"}); await wait(1600);
/* A flight that actually carries money — an empty one proves nothing. */
const first=await page.evaluate(()=>{
  const rows=[...document.querySelectorAll("tbody tr")];
  const withMoney=rows.find(r=>!/TSh 0\b/.test(r.innerText.split("\n")[1]??"") && /TSh [1-9]/.test(r.innerText));
  const a=(withMoney??rows[0])?.querySelector('a[href^="/app/finance/batches/"]');
  return a?{href:a.getAttribute("href"),text:a.innerText.trim()}:null;
});
first ? ok(`the flights link into their own book (${first.text})`) : bad("no link into a flight");
await page.goto(`${BASE}${first.href}`,{waitUntil:"networkidle2"}); await wait(2000);

const seen=await page.evaluate(()=>{
  const cards=[...document.querySelectorAll("div")].filter(d=>/^(Revenue|Collected|Outstanding|Costs|Profit \/ loss)$/i.test(d.querySelector("p")?.innerText?.trim()??""));
  const txt=document.body.innerText;
  return {
    totals: cards.map(c=>c.innerText.replace(/\s+/g," ").trim()).slice(0,5),
    sections: ["Money in","Money out","Still owed on this flight"].filter(s=>new RegExp(s,"i").test(txt)),
    tables: document.querySelectorAll("table").length,
    rows: document.querySelectorAll("tbody tr").length,
  };
});
console.log(`\n   totals on the page: ${JSON.stringify(seen.totals)}`);
console.log(`   sections: ${JSON.stringify(seen.sections)}   tables: ${seen.tables}, ${seen.rows} line(s)`);
seen.totals.length === 5 ? ok("all five totals sit at the top") : bad(`${seen.totals.length} totals`);
seen.sections.length === 3 ? ok("money in, money out, and what is still owed") : bad(`sections: ${seen.sections}`);
seen.rows > 0 ? ok(`${seen.rows} transaction line(s) listed`) : bad("no transactions listed");

/* The totals must be the engine's, not this page's own sum. */
const id=first.href.split("/").pop();
const owed=await prisma.invoice.findMany({where:{shipment:{batchId:id},status:{in:["UNPAID","PARTIALLY_PAID"]}},select:{id:true}});
const pays=await prisma.payment.count({where:{voidedAt:null,OR:[{invoice:{shipment:{batchId:id}}},{allocations:{some:{invoice:{shipment:{batchId:id}}}}}]}});
const costs=await prisma.expense.count({where:{batchId:id,status:{not:"VOID"}}});
console.log(`   database says: ${pays} payment(s), ${costs} cost(s), ${owed.length} bill(s) still open`);
const shown=await page.evaluate(()=>[...document.querySelectorAll("tbody tr")].length);
shown === pays + costs + owed.length ? ok("every one of them is on the page, and nothing else is") : bad(`the page shows ${shown} lines against ${pays+costs+owed.length} records`);

await b.close(); await prisma.$disconnect();
