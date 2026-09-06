/**
 * SUPPORT RAISES A MERGED CLAIM THAT IS SHORT, FINANCE CONFIRMS IT.
 *
 * The owner's rule: Support does everything on their side and sends it up for
 * Finance to confirm. Until now the tick travelled but the answer to "which
 * bill" did not, so verification refused a claim Support had been shown a
 * confirmation for.
 */
import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";
const BASE="http://localhost:3177"; const PW=process.env.SEED_ADMIN_PASSWORD;
const CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const prisma=new PrismaClient();
const ok=(m)=>console.log(`   ✓ ${m}`); const bad=(m)=>{console.log(`   ✗ ${m}`);process.exitCode=1;};
const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
async function cookies(email){const r1=await fetch(`${BASE}/api/auth/csrf`);const c1=r1.headers.getSetCookie();const{csrfToken}=await r1.json();
const r2=await fetch(`${BASE}/api/auth/callback/credentials`,{method:"POST",redirect:"manual",headers:{"content-type":"application/x-www-form-urlencoded",cookie:c1.map(c=>c.split(";")[0]).join("; ")},body:new URLSearchParams({csrfToken,email,password:PW,redirect:"false"})});
return [...c1,...r2.headers.getSetCookie()].map(c=>{const p=c.split(";")[0];const i=p.indexOf("=");return{name:p.slice(0,i),value:p.slice(i+1),url:BASE};}).filter(c=>c.name&&c.value);}
const SET=`window.__set=(el,v)=>{let p=Object.getPrototypeOf(el),d=Object.getOwnPropertyDescriptor(p,"value");while(p&&!(d&&d.set)){p=Object.getPrototypeOf(p);d=p?Object.getOwnPropertyDescriptor(p,"value"):null;}if(d&&d.set)d.set.call(el,v);else el.value=v;el.dispatchEvent(new Event("input",{bubbles:true}));el.dispatchEvent(new Event("change",{bubbles:true}));};
window.__click=(re)=>{const b=[...document.querySelectorAll("button")].find(x=>new RegExp(re).test(x.innerText));if(b){b.click();return b.innerText.replace(/\\s+/g," ").slice(0,60);}return null;};`;

const bills = await prisma.invoice.findMany({
  where: { status: { in: ["UNPAID","PARTIALLY_PAID"] }, shipment: { status: "RECEIVED_AT_DAR" } },
  select: { id:true, total:true, amountPaid:true, amountAdjusted:true, exchangeRate:true, customerId:true,
    /* Both ways a bill can sit inside a live claim — see pendingClaimWhere.
       Reading only `submissions` misses every merged claim. */
    submissions: { where: { status: "PENDING" }, select: { id: true } },
    submissionAllocations: { where: { submission: { status: "PENDING" } }, select: { id: true } },
    shipment:{select:{trackingNumber:true}} } })
  .then((rows) => rows.filter((r) => r.submissions.length === 0 && r.submissionAllocations.length === 0));
const byCustomer = new Map();
for (const b of bills) { const a = byCustomer.get(b.customerId) ?? []; a.push(b); byCustomer.set(b.customerId, a); }
const pair = [...byCustomer.entries()].find(([,v]) => v.length >= 2);
const [customerId, all] = pair;
const two = all.slice(0,2);
const rate = Number(two[0].exchangeRate);
const owed = two.reduce((s,b)=>s + Math.round((Number(b.total)-Number(b.amountPaid)-Number(b.amountAdjusted))*rate), 0);
const sending = owed - 50;
const due = (b) => Number(b.total) - Number(b.amountPaid) - Number(b.amountAdjusted);
const bigger = two.reduce((m,b)=> due(b) > due(m) ? b : m);
console.log(`SUPPORT: ${two.map(b=>b.shipment.trackingNumber).join(" + ")} come to TSh ${owed.toLocaleString()}`);
console.log(`the customer sent TSh ${sending.toLocaleString()} — 50 short; the largest is ${bigger.shipment.trackingNumber}\n`);

const browser=await puppeteer.launch({executablePath:CHROME,headless:"new",args:["--no-sandbox"]});
const page=await browser.newPage(); page.on("dialog",d=>d.accept());
await page.setViewport({width:1500,height:1400});
await page.setCookie(...(await cookies("support@targetexpress.co.tz")));
await page.goto(`${BASE}/app/finance/payments/new?customer=${customerId}`,{waitUntil:"networkidle2"});
await page.evaluate(SET); await wait(1500);
await page.evaluate((tx)=>{for(const t of tx){const row=[...document.querySelectorAll("label")].find(e=>e.textContent.includes(t)&&e.querySelector('input[type=checkbox]'));const cb=row?.querySelector('input[type=checkbox]');if(cb&&!cb.checked)cb.click();}},two.map(b=>b.shipment.trackingNumber));
await wait(1000);
await page.evaluate((v)=>{window.__set(document.getElementById("cargoShown"),String(v));}, sending);
await wait(1000);
const notice = await page.evaluate(()=>document.querySelector(".money-notice")?.innerText.replace(/\s+/g," ") ?? null);
notice ? ok(`Support sees: "${notice}"`) : bad("Support gets no shortfall notice");
const pressed = await page.evaluate(()=>window.__click("Clear it"));
pressed ? ok("Support can press it too") : bad("no Clear it for Support");
await wait(600);
await page.evaluate(()=>{const sel=document.querySelector('select[name=accountId]');if(sel)window.__set(sel,[...sel.options].find(o=>o.value).value);});
await wait(400);
const btn = await page.evaluate(()=>{const b=[...document.querySelectorAll("button")].find(x=>/Send to Finance/.test(x.innerText));return b?{text:b.innerText.replace(/\s+/g," "),disabled:b.disabled}:null;});
console.log(`   submit button: ${JSON.stringify(btn)}`);
await page.evaluate(()=>window.__click("Send to Finance"));
await wait(6000);
const err = await page.evaluate(()=>[...document.querySelectorAll("p,div")].map(e=>e.innerText).find(t=>t&&/could not|cannot|refus|error|Tick the cargo|more than/i.test(t)&&t.length<300) ?? null);
if (err) console.log(`   screen says: ${err.replace(/\s+/g," ").slice(0,200)}`);

const sub = await prisma.paymentSubmission.findFirst({ where:{ status:"PENDING", customerId, allocations: { some: { invoiceId: { in: two.map((b)=>b.id) } } } },
  orderBy:{ submittedAt:"desc" },
  select:{ id:true, submissionNumber:true, amount:true, clearShortfall:true,
    allocations:{ select:{ invoiceId:true, amount:true,
      invoice:{ select:{ total:true, amountPaid:true, amountAdjusted:true } } } } } });
if (!sub) { bad("no claim was raised"); await browser.close(); await prisma.$disconnect(); process.exit(1); }
console.log(`\n   claim ${sub.submissionNumber} for ${sub.amount}, covers ${sub.allocations.length} bills`);
sub.clearShortfall ? ok("the claim carries the tick") : bad("tick lost between form and row");
/* Nothing is stored — the bill is worked out from what each still owes, the
   same rule the screen used. Check the rule lands on the same bill. */
const derived = sub.allocations.reduce((m,a)=> (Number(a.invoice.total)-Number(a.invoice.amountPaid)-Number(a.invoice.amountAdjusted)) > (Number(m.invoice.total)-Number(m.invoice.amountPaid)-Number(m.invoice.amountAdjusted)) ? a : m);
derived.invoiceId === bigger.id ? ok("the rule lands on the largest bill it covers") : bad(`the rule picked ${derived.invoiceId}`);
const allocSum = sub.allocations.reduce((s,a)=>s+Number(a.amount),0);
Math.abs(allocSum - Number(sub.amount)) < 0.01 ? ok(`its allocations total ${allocSum} = what arrived`) : bad(`allocations ${allocSum} vs ${sub.amount}`);

/* FINANCE now confirms it. */
console.log(`\nFINANCE opens the queue:`);
const fin = await browser.newPage(); fin.on("dialog",d=>d.accept());
await fin.setViewport({width:1500,height:1600});
await fin.setCookie(...(await cookies("finance@targetexpress.co.tz")));
await fin.goto(`${BASE}/app/finance/verify`,{waitUntil:"networkidle2"});
await fin.evaluate(SET); await wait(2000);
const seen = await fin.evaluate((n)=>{const el=[...document.querySelectorAll("li,article,div")].reverse().find(e=>e.textContent.includes(n)&&e.querySelector("button"));return el?el.innerText.replace(/\s+/g," ").slice(0,400):null;},sub.submissionNumber);
if(!seen){bad(`${sub.submissionNumber} is not on the verify queue`);}
else {
  const opened = await fin.evaluate((n)=>{const el=[...document.querySelectorAll("li,article,div")].reverse().find(e=>e.textContent.includes(n)&&e.querySelector("button"));const b=[...el.querySelectorAll("button")].find(x=>/verify|check|agree/i.test(x.innerText));if(b){b.click();return b.innerText.trim();}return null;},sub.submissionNumber);
  console.log(`   opened via "${opened}"`);
  await wait(1200);
  const panel = await fin.evaluate(()=>{
    const l=[...document.querySelectorAll("label")].find(e=>/Clear the last|rest is not coming|written off/i.test(e.innerText));
    if(!l) return { none: [...document.querySelectorAll("label,p")].map(e=>e.innerText.replace(/\s+/g," ")).filter(t=>/short|owing|clear|written/i.test(t)).slice(0,3) };
    return {text:l.innerText.replace(/\s+/g," "),ticked:l.querySelector("input[type=checkbox]")?.checked,
            sent: document.querySelector('input[name=clearShortfall]')?.value ?? null};
  });
  if (panel?.text) {
    ok(`Finance is offered: "${panel.text}"`);
    panel.ticked ? ok("and it opens already ticked, as Support left it") : bad("it does not carry Support's answer");
    panel.sent === "1" ? ok("the form will send that answer") : bad(`the form sends clearShortfall=${panel.sent}`);
  } else bad("the tick is still withheld on a merged claim: " + JSON.stringify(panel?.none));
  if (process.env.UNTICK === "1") {
    const off = await fin.evaluate(()=>{const l=[...document.querySelectorAll("label")].find(e=>/Clear the last/.test(e.innerText));const cb=l?.querySelector("input[type=checkbox]");if(cb?.checked){cb.click();return true;}return false;});
    off ? ok("Finance unticked it") : bad("could not untick");
    await wait(500);
    const sent = await fin.evaluate(()=>document.querySelector('input[name=clearShortfall]')?.value ?? null);
    sent === "0" ? ok("the form now sends a plain NO, not a silence") : bad(`sends ${sent}`);
  }
  await fin.evaluate(()=>{const sel=[...document.querySelectorAll("select")].find(s=>/account/i.test(s.name));if(sel&&!sel.value)window.__set(sel,[...sel.options].find(o=>o.value).value);});
  await wait(400);
  const acct = await fin.evaluate(()=>{const sel=[...document.querySelectorAll("select")].find(s=>/account/i.test(s.name));return sel?{name:sel.name,value:sel.value}:null;});
  console.log(`   account: ${JSON.stringify(acct)}`);
  console.log(`   pressed: ${await fin.evaluate(()=>window.__click("Confirm and record"))}`);
  await wait(7000);
  const err = await fin.evaluate(()=>[...document.querySelectorAll("p,div")].map(e=>e.innerText).find(t=>t&&/could not|cannot|refus|already|does not/i.test(t)&&t.length<300) ?? null);
  if (err) console.log(`   screen says: ${err.replace(/\s+/g," ").slice(0,220)}`);
}

const after = await prisma.invoice.findMany({ where:{ id:{ in: two.map(b=>b.id) } },
  select:{ status:true, total:true, amountPaid:true, amountAdjusted:true, shipment:{select:{trackingNumber:true}} } });
console.log();
for (const i of after) console.log(`   ${i.shipment.trackingNumber}  ${i.status.padEnd(14)} due ${i.total} paid ${i.amountPaid} cleared ${i.amountAdjusted}`);
const state = await prisma.paymentSubmission.findUnique({where:{id:sub.id},select:{status:true,rejectionReason:true}});
console.log(`   claim is now ${state.status}${state.rejectionReason?` — ${state.rejectionReason}`:""}`);
state.status === "VERIFIED" ? ok("the claim was confirmed, not refused") : bad(`claim ended ${state.status}`);
const onBigger = after.find(i=>i.shipment.trackingNumber===bigger.shipment.trackingNumber);
if (process.env.UNTICK === "1") {
  Number(onBigger.amountAdjusted) === 0 ? ok("nothing written off — Finance said no and that is what happened") : bad("it was written off anyway");
  onBigger.status === "PARTIALLY_PAID" ? ok(`${bigger.shipment.trackingNumber} is left part paid, still owed`) : bad(`it is ${onBigger.status}`);
  after.filter(i=>i!==onBigger).every(i=>i.status==="PAID") ? ok("the other bill settled in full") : bad("the other bill did not settle");
} else {
  after.every(i=>i.status==="PAID") ? ok("both bills settled") : bad("a bill is still open");
  Number(onBigger.amountAdjusted) > 0 ? ok(`the write-off landed on ${bigger.shipment.trackingNumber} — the bill Support was shown`) : bad("the write-off went elsewhere");
}
await browser.close(); await prisma.$disconnect();
