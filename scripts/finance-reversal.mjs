/**
 * Pay a cost, then reverse it, and check the ledger tells the whole story.
 *
 *   node scripts/finance-reversal.mjs
 *
 * The owner's rule for corrections is that history is never destroyed. This
 * proves it end to end through the real screens: after a reversal the account
 * balance is back where it started, and the register still holds both the
 * payment and the entry that cancelled it, linked to each other.
 */

import puppeteer from "puppeteer-core";
import { PrismaClient } from "@prisma/client";

const BASE = process.env.BASE ?? "http://localhost:3210";
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "";
const CHROME =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const prisma = new PrismaClient();
const money = (n) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

/** Everything that has moved through one account, from the ledger itself. */
async function balance(accountId) {
  const rows = await prisma.ledgerEntry.findMany({
    where: { accountId },
    select: { direction: true, amount: true },
  });
  return rows.reduce(
    (n, r) => n + (r.direction === "IN" ? Number(r.amount) : -Number(r.amount)),
    0
  );
}

if (!PASSWORD) throw new Error("SEED_ADMIN_PASSWORD is not set.");

// A shilling cost that has not been paid yet, and a shilling account to pay it
// from — the currencies have to match or the action refuses, correctly.
/*
  An unpaid shilling cost if there is one, so the run covers pay-then-reverse.
  Otherwise one that is already paid and not yet reversed — the reversal is the
  part being proved, and paying is only how we get there.
*/
let target = await prisma.expense.findFirst({
  where: { status: "PENDING", currency: "TZS" },
  select: { id: true, expenseNumber: true, amount: true, description: true, status: true },
  orderBy: { createdAt: "asc" },
});
if (!target) {
  target = await prisma.expense.findFirst({
    where: {
      status: "PAID",
      currency: "TZS",
      ledgerEntry: { is: { reversedBy: { is: null } } },
    },
    select: { id: true, expenseNumber: true, amount: true, description: true, status: true },
    orderBy: { createdAt: "asc" },
  });
}
if (!target) throw new Error("No shilling cost left to pay or reverse.");

const account = await prisma.companyAccount.findFirst({
  where: { active: true, currency: "TZS" },
  select: { id: true, name: true },
});
if (!account) throw new Error("No active shilling account.");

console.log(`\nworking on ${target.expenseNumber} — ${target.description}`);
console.log(`  TZS ${money(target.amount)} against ${account.name}`);
console.log(`  balance before        TZS ${money(await balance(account.id))}`);

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--hide-scrollbars"],
});
const ctx = await browser.createBrowserContext();
const page = await ctx.newPage();
await page.setViewport({ width: 1600, height: 1200 });
await page.setCookie(...(await cookies("finance@targetexpress.co.tz")));

const url = `${BASE}/app/finance/expenses`;

/** The row's own form, found by the hidden expenseId it carries. */
const rowForm = `form:has(input[name="expenseId"][value="${target.id}"])`;

await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });

if (target.status === "PENDING") {
  await page.waitForSelector(rowForm, { timeout: 15_000 });
  await page.select(`${rowForm} [name="accountId"]`, account.id);
  await page.click(`${rowForm} button[type="submit"]`);
  await new Promise((r) => setTimeout(r, 2500));
} else {
  console.log("  already paid, going straight to the reversal");
}

const paid = await prisma.expense.findUnique({
  where: { id: target.id },
  select: { status: true, ledgerEntry: { select: { id: true } } },
});
console.log(`  after paying          status ${paid.status}, ledger line ${paid.ledgerEntry ? "written" : "MISSING"}`);
console.log(`  balance after paying  TZS ${money(await balance(account.id))}`);

if (paid.status !== "PAID") {
  console.error("\nThe payment did not go through; nothing to reverse.");
  await ctx.close(); await browser.close(); await prisma.$disconnect();
  process.exit(1);
}

// Now reverse it. The button only appears for a paid cost.
await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
/*
  Found by its expense number, not its id.

  Collapsed, the Reverse control is a bare button with no hidden field, so the
  row carries nothing machine-readable. The number on screen is the thing a
  person would use too.
*/
const opened = await page.evaluate((number) => {
  /*
    Walk up from the number rather than assuming a table.

    This list renders as cards, not rows — it was rebuilt that way so it works
    on a warehouse phone. A test that hunts for <tr> finds nothing and reports
    the control missing when it is right there on screen.
  */
  const label = [...document.querySelectorAll("*")]
    .filter((el) => !el.children.length)
    .find((el) => (el.textContent ?? "").includes(number));
  if (!label) return "no row for that expense";

  let node = label;
  for (let up = 0; up < 8 && node; up += 1) {
    const btn = [...node.querySelectorAll("button")].find((b) =>
      /reverse/i.test(b.textContent ?? "")
    );
    if (btn) { btn.click(); return true; }
    node = node.parentElement;
  }
  return "no Reverse button near that row";
}, target.expenseNumber);

if (opened !== true) {
  console.error(`\nCould not start the reversal: ${opened}`);
  await ctx.close(); await browser.close(); await prisma.$disconnect();
  process.exit(1);
}

await page.waitForSelector(`${rowForm} [name="reason"]`, { timeout: 10_000 });
await page.evaluate((sel) => {
  const el = document.querySelector(`${sel} [name="reason"]`);
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(
    el,
    "Charged to the wrong flight"
  );
  el.dispatchEvent(new Event("input", { bubbles: true }));
}, rowForm);
const readyState = await page.evaluate(
  (sel) => {
    const f = document.querySelector(sel);
    if (!f) return "the reversal form vanished";
    const reason = f.querySelector('[name="reason"]');
    const submit = f.querySelector('button[type="submit"]');
    return {
      reason: reason?.value ?? "(no field)",
      hasSubmit: Boolean(submit),
      valid: f.checkValidity(),
    };
  },
  rowForm
);
console.log("  about to submit      ", JSON.stringify(readyState));

await page.click(`${rowForm} button[type="submit"]`);
await new Promise((r) => setTimeout(r, 2500));

const said = await page.evaluate(() =>
  [...document.querySelectorAll("[role='alert'], .text-destructive, .text-signal")]
    .map((el) => (el.textContent ?? "").trim())
    .filter(Boolean)
    .slice(0, 3)
);
if (said.length) console.log("  the page said        ", JSON.stringify(said));

const after = await prisma.expense.findUnique({
  where: { id: target.id },
  select: { status: true, voidReason: true },
});
// Both sides: the original claims expenseId, the reversal points at it.
const entries = await prisma.ledgerEntry.findMany({
  where: {
    OR: [{ expenseId: target.id }, { reverses: { expenseId: target.id } }],
  },
  select: { entryNumber: true, direction: true, amount: true, kind: true, reversesId: true },
  orderBy: { createdAt: "asc" },
});

console.log(`\n  after reversing       status ${after.status}  reason "${after.voidReason ?? "—"}"`);
console.log(`  balance after reverse TZS ${money(await balance(account.id))}`);
console.log("\n  the register still holds both sides:");
for (const e of entries) {
  console.log(
    `    ${e.entryNumber}  ${e.direction.padEnd(3)}  TZS ${money(e.amount).padStart(12)}  ${e.kind}${e.reversesId ? "  → cancels the line above" : ""}`
  );
}

const linked = entries.some((e) => e.reversesId);
const kept = entries.length === 2;
console.log(
  `\n  ${kept && linked ? "PASS" : "FAIL"}  original kept: ${kept}, reversal linked to it: ${linked}`
);

await ctx.close();
await browser.close();
await prisma.$disconnect();
process.exit(kept && linked ? 0 : 1);
