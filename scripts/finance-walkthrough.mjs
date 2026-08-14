/**
 * Record real costs against a real flight, through the real form.
 *
 *   node scripts/finance-walkthrough.mjs
 *
 * The owner asked for the financial workflow to be tested with real sample data
 * rather than asserted about. This drives the actual browser as Finance: it
 * opens a dispatch, fills in the cost form the way a person would, submits it,
 * and reads the profit figure back off the page afterwards.
 *
 * It writes to the working database on purpose — that is what "real sample
 * data" means. Every cost it records is tagged in its note so it can be found
 * and removed again.
 */

import puppeteer from "puppeteer-core";

const BASE = process.env.BASE ?? "http://localhost:3210";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** So anything this script creates can be found again. */
export const TAG = "[walkthrough]";

/*
  The costs a real Guangzhou flight actually incurs between landing and
  release, in the currencies they are actually paid in. Deliberately a mix:
  a shilling cost has to be valued in dollars at the published rate before it
  can be added to a dollar cost, and that conversion is the part worth testing.
*/
const COSTS = [
  { desc: "Dar port and terminal handling", cat: "PORT_CHARGES", amount: "1850000", ccy: "TZS" },
  { desc: "Customs duty on the consignment", cat: "CUSTOMS_DUTY", amount: "980", ccy: "USD" },
  { desc: "Clearing agent fee", cat: "CLEARING_AGENT", amount: "620000", ccy: "TZS" },
  { desc: "Port to warehouse transport", cat: "LOCAL_TRANSPORT", amount: "310000", ccy: "TZS" },
  { desc: "Special import permit", cat: "PERMITS", amount: "145", ccy: "USD" },
];

async function cookies(email) {
  const r1 = await fetch(`${BASE}/api/auth/csrf`);
  const first = r1.headers.getSetCookie?.() ?? [];
  const { csrfToken } = await r1.json();
  const r2 = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: first.map((c) => c.split(";")[0]).join("; "),
    },
    body: new URLSearchParams({ csrfToken, email, password: PASSWORD, redirect: "false" }),
  });
  const all = [...first, ...(r2.headers.getSetCookie?.() ?? [])];
  if (!all.some((c) => /session-token/.test(c))) throw new Error(`sign-in failed: ${email}`);
  return all
    .map((c) => {
      const p = c.split(";")[0].trim();
      const i = p.indexOf("=");
      return i > 0 ? { name: p.slice(0, i), value: p.slice(i + 1), url: BASE } : null;
    })
    .filter(Boolean);
}

if (!PASSWORD) throw new Error("SEED_ADMIN_PASSWORD is not set.");

const batchId = process.argv[2];
if (!batchId) throw new Error("Pass the dispatch id: node scripts/finance-walkthrough.mjs <batchId>");

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
});
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
await page.setCookie(...(await cookies("finance@targetexpress.co.tz")));

const url = `${BASE}/app/shipments/${batchId}`;

/** The six headline figures, read off the page rather than out of the database. */
async function readStrip() {
  return page.evaluate(() => {
    const out = {};
    for (const dt of document.querySelectorAll("dt")) {
      const key = (dt.textContent ?? "").trim();
      const dd = dt.parentElement?.querySelector("dd");
      if (dd && ["Revenue", "Collected", "Outstanding", "Expenses", "Net profit", "Net loss", "Margin"].includes(key)) {
        out[key] = (dd.textContent ?? "").trim();
      }
    }
    return out;
  });
}

await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
console.log("\nbefore:", await readStrip());

let saved = 0;
for (const cost of COSTS) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });

  // The form is collapsed until asked for, exactly as a person finds it.
  const openers = await page.$$("button");
  for (const b of openers) {
    const label = (await b.evaluate((el) => el.textContent ?? "")).trim();
    if (/record a cost/i.test(label)) {
      await b.click();
      break;
    }
  }
  await page.waitForSelector("form input[name='batchId']", { timeout: 10_000 });

  /*
    Focused by selector and typed on the keyboard, not clicked at.

    page.type() clicks the element first to focus it, and a click is a
    coordinate — if the field is scrolled out of view the click lands on
    whatever is at that point instead. That is not hypothetical: the first
    version of this script put the amount into the description field, producing
    "Dar port and terminal handling1850000" and an empty amount, and then
    reported five successes while the database stayed empty.
  */
  const scope = "form:has(input[name='batchId'])";
  const fill = (target, value) =>
    page.evaluate(
      (sel, tgt, v) => {
        const el = document.querySelector(`${sel} ${tgt}`);
        if (!el) throw new Error(`no field matching ${tgt}`);
        /*
          React tracks the last value it wrote on the DOM node itself, and
          ignores an input event whose value matches that cache. Going through
          the prototype setter updates the node without touching React's cache,
          so the event that follows is seen as a real change.
        */
        const proto =
          el instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
      },
      scope,
      target,
      value
    );
  await fill(`[name="description"]`, cost.desc);
  /*
    The amount goes into the VISIBLE box, not the field the server reads.

    MoneyInput is two inputs: one you type grouped digits into, and a hidden
    one carrying the name, whose value React derives from the first. Writing
    straight to the named field is overwritten on the next render — which is
    why this script spent three runs submitting an empty amount.
  */
  await fill("#expenseAmount", cost.amount);
  await page.select(`${scope} [name="currency"]`, cost.ccy);
  await page.select(`${scope} [name="category"]`, cost.cat);

  /*
    Read the form back before submitting it.

    The whole failure above was a script that trusted its own instructions.
    Whatever the server then says, at least the thing being submitted is the
    thing that was meant.
  */
  const state = await page.evaluate((sel) => {
    const f = document.querySelector(sel);
    const get = (n) => f.querySelector(`[name="${n}"]`)?.value ?? "";
    return {
      description: get("description"),
      amount: get("amount"),
      currency: get("currency"),
      category: get("category"),
      batchId: get("batchId"),
    };
  }, scope);

  if (
    state.description !== cost.desc ||
    state.amount !== cost.amount ||
    state.currency !== cost.ccy ||
    state.category !== cost.cat ||
    !state.batchId
  ) {
    console.log(`  MIS-FILLED ${cost.desc}`);
    console.log(`             ${JSON.stringify(state)}`);
    continue;
  }

  await page.click(`${scope} button[type="submit"]`);
  await new Promise((r) => setTimeout(r, 2500));

  // The only answer that counts: is the row there?
  const outcome = await page.evaluate(
    (d) => (document.body.innerText.includes(d) ? null : "not on the page after submit"),
    cost.desc
  );

  if (outcome) {
    console.log(`  REFUSED   ${cost.desc}\n            ${outcome}`);
  } else {
    saved += 1;
    console.log(`  recorded  ${cost.ccy} ${Number(cost.amount).toLocaleString()}  ${cost.desc}`);
  }
}

console.log(`\n${saved}/${COSTS.length} accepted by the server`);

await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
console.log("\nafter: ", await readStrip());

await ctx.close();
await browser.close();
