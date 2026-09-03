import puppeteer from "puppeteer-core";
const BASE = "http://localhost:3177";
const PATHS = ["/app/finance/income","/app/finance/invoices","/app/finance/ledger","/app/finance/accounts","/app/finance/expenses","/app/manager/operations","/app/manager/finance","/app/manager/batches","/app/manager/approvals","/app/manager/report","/app/collections","/app/support/tickets","/app/support/sourcing","/app/admin/settings","/app/admin/pricing","/app/verification","/app/scan","/app/incoming","/app/finance/payroll","/app/manager/payroll"];
const b = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: "new", args: ["--no-sandbox"] });
const page = await b.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle0" });
const csrf = await page.evaluate(async (x) => (await (await fetch(`${x}/api/auth/csrf`)).json()).csrfToken, BASE);
await page.evaluate(async (a) => { await fetch(`${a.b}/api/auth/callback/credentials`, { method:"POST", headers:{"content-type":"application/x-www-form-urlencoded"}, body:new URLSearchParams({csrfToken:a.c,email:"ceo@targetexpress.co.tz",password:"TargetExpress2026!",callbackUrl:`${a.b}/app/dashboard`,json:"true"}) }); }, {b:BASE,c:csrf});
for (const w of [375, 768]) {
  await page.setViewport({ width: w, height: 900 });
  for (const p of PATHS) {
    try {
      await page.goto(`${BASE}${p}`, { waitUntil: "networkidle0", timeout: 90000 });
      await new Promise(r => setTimeout(r, 350));
      const res = await page.evaluate(() => {
        const de = document.documentElement, limit = de.clientWidth, over = de.scrollWidth - limit, out = [];
        if (over > 1) for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect(); if (!r.width || r.right <= limit+1) continue;
          let kid=false; for (const c of el.children){const cr=c.getBoundingClientRect(); if(cr.width&&cr.right>limit+1){kid=true;break;}}
          if (kid) continue;
          out.push({t:el.tagName.toLowerCase(),c:String(el.className||"").slice(0,170),r:Math.round(r.right),w:Math.round(r.width),x:(el.textContent||"").trim().slice(0,45)});
        }
        return { over, out: out.slice(0,5), h: document.body.scrollHeight, u: location.pathname };
      });
      console.log(`${w} ${p} -> ${res.u} over=${res.over} h=${res.h}`);
      for (const c of res.out) console.log(`   <${c.t}> right=${c.r} w=${c.w} "${c.x}" :: ${c.c}`);
    } catch(e){ console.log(`ERR ${w} ${p} ${e.message.slice(0,80)}`); }
  }
}
await b.close();
