/**
 * Record one office cost and one special cost, through the real form.
 *
 *   node scripts/finance-expense-kinds.mjs
 *
 * Proves the three kinds of spending are actually separable: a flight cost
 * belongs to a dispatch, an office cost belongs to none, and a special cost is
 * recorded and paid but kept out of profit. Without one of each in the data,
 * the filters are untested and the profit figures are unproven.
 *
 * Both are tagged [walkthrough] in the note so they can be found again.
 */

import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3210";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const prisma = new PrismaClient();

const COSTS = [
  {
    what: "office",
    desc: "Office internet — August",
    cat: "COMMUNICATION",
    amount: "180000",
    ccy: "TZS",
    klass: "OPERATING",
  },
  {
    what: "special",
    desc: "Owner drawing",
    cat: "OTHER",
    amount: "400",
    ccy: "USD",
    klass: "NON_OPERATING",
  },
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

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
});
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: 1600, height: 1400 });
await page.setCookie(...(await cookies("finance@targetexpress.co.tz")));

const url = `${BASE}/app/finance/expenses`;

/** Write through the setter React watches, not by clicking at coordinates. */
const write = (sel, value) =>
  page.evaluate(
    (s, v) => {
      const el = document.querySelector(s);
      if (!el) throw new Error(`missing ${s}`);
      const proto =
        el instanceof HTMLTextAreaElement
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    sel,
    value
  );

let made = 0;

for (const cost of COSTS) {
  await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });

  // Open the form, then open the advanced fields where the class lives.
  for (const b of await page.$$("button")) {
    const label = (await b.evaluate((el) => el.textContent ?? "")).trim();
    if (/record a cost/i.test(label)) { await b.click(); break; }
  }
  await page.waitForSelector('form [name="description"]', { timeout: 10_000 });

  for (const b of await page.$$("button")) {
    const label = (await b.evaluate((el) => el.textContent ?? "")).trim();
    // The toggle names what it reveals rather than saying "more", so match on
    // that. A regex guessing at "more" silently leaves the panel shut and the
    // class field simply absent — which is how the first run reported a
    // failure it could not explain.
    if (/which flight|what date|fewer details/i.test(label)) { await b.click(); break; }
  }
  await new Promise((r) => setTimeout(r, 400));

  const form = 'form:has([name="description"])';
  await write(`${form} [name="description"]`, cost.desc);
  // The visible money box, not the hidden field that carries the name.
  await write(`${form} #expenseAmount`, cost.amount);
  await page.select(`${form} [name="currency"]`, cost.ccy);
  await page.select(`${form} [name="category"]`, cost.cat);

  const hasClass = await page.$(`${form} [name="expenseClass"]`);
  if (hasClass) await page.select(`${form} [name="expenseClass"]`, cost.klass);
  const hasNote = await page.$(`${form} [name="note"]`);
  if (hasNote) await write(`${form} [name="note"]`, "[walkthrough]");

  const state = await page.evaluate((sel) => {
    const f = document.querySelector(sel);
    const get = (n) => f.querySelector(`[name="${n}"]`)?.value ?? "(absent)";
    return {
      description: get("description"),
      amount: get("amount"),
      currency: get("currency"),
      category: get("category"),
      expenseClass: get("expenseClass"),
      batchId: get("batchId"),
    };
  }, form);

  if (state.description !== cost.desc || state.amount !== cost.amount) {
    console.log(`  MIS-FILLED ${cost.desc}  ${JSON.stringify(state)}`);
    continue;
  }
  if (cost.klass === "NON_OPERATING" && state.expenseClass !== "NON_OPERATING") {
    console.log(`  CANNOT SET CLASS  ${cost.desc}  saw ${state.expenseClass}`);
    continue;
  }

  await page.click(`${form} button[type="submit"]`);
  await new Promise((r) => setTimeout(r, 2500));

  const saved = await prisma.expense.findFirst({
    where: { description: cost.desc },
    select: { expenseNumber: true, expenseClass: true, batchId: true },
  });
  if (!saved) {
    console.log(`  REFUSED   ${cost.desc}`);
    continue;
  }
  made += 1;
  console.log(
    `  recorded  ${saved.expenseNumber}  ${cost.desc}  class=${saved.expenseClass}  flight=${saved.batchId ? "yes" : "none"}`
  );
}

console.log(`\n${made}/${COSTS.length} recorded\n`);

// What each filter would now return, straight from the database.
const counts = {
  flight: await prisma.expense.count({
    where: { batchId: { not: null }, expenseClass: "OPERATING" },
  }),
  office: await prisma.expense.count({
    where: { batchId: null, expenseClass: "OPERATING" },
  }),
  special: await prisma.expense.count({ where: { expenseClass: "NON_OPERATING" } }),
};
console.log("  by kind:", JSON.stringify(counts));

await ctx.close();
await browser.close();
await prisma.$disconnect();
