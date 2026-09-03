/**
 * THE 20,007 CHECK.
 *
 *   node scripts/check-money-drift.mjs
 *
 * Every movement of money is stored twice: `amount`, exactly as it was typed,
 * in the currency it was typed in; and `amountUsd`, a Decimal(12,2) snapshot so
 * movements in different currencies can be totalled against each other.
 *
 * The snapshot is a convenience. It is NOT the money. A cost typed as
 * TSh 20,000 is stored as USD 7.41 — the eighth of a cent has nowhere to go —
 * and a screen that adds up snapshots and multiplies the total back by 2,700
 * prints TSh 20,007 for money nobody spent. The error is per ROW, so the
 * busiest month drifts furthest, which is exactly backwards. It has been found
 * in production three times: office costs at TSh 59,994, a batch expense line
 * at TSh 20,007, and a month's spend at TSh 100,008.
 *
 * This script fails when a file both totals `amountUsd` and renders shillings,
 * unless it is listed below as checked. It is deliberately coarse: a false
 * alarm costs somebody two minutes of reading, and the thing it is guarding
 * against is a wrong number in the owner's books.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["lib", "app", "components"];

/*
  Files that total the snapshot AND print shillings, and have been read.

  A name here is a promise that the shilling figure on that screen comes from
  `sumShillings` (or is a genuinely dollar-native total), NOT from multiplying
  a snapshot total back up. Remove a name and the check will make you re-read
  it, which is the point.
*/
const CHECKED = new Set([
  /* Grouped by currency in SQL, then converted per group — a shilling group
     is taken at its own `amount` and never through the snapshot. */
  "app/app/finance/transactions/page.tsx",
  "components/app/batch-expenses.tsx",
  "app/app/manager/batches/page.tsx",
  /* Dollar-native. Invoices and the credit book are priced in USD, so a
     single multiplication is exact and there is no per-row snapshot to lose.
     Reconciliation prints a raw amountUsd as dollars, and takes its batch
     figures from profitByDispatch, which totals per row. */
  "app/app/finance/credit/page.tsx",
  "app/app/manager/reconciliation/page.tsx",
  "lib/messages.ts",
  "lib/support.ts",
]);

/** Totalling the dollar snapshot, in SQL or in code. */
const SUMS_SNAPSHOT = [
  /_sum:\s*\{\s*amountUsd/,
  /\.amountUsd\s*\)/,
  /amountUsd\s*\?\?/,
];
/** Printing a shilling figure. */
const PRINTS_LOCAL = [/formatShillings\s*\(/, /formatLocal\s*\(/, /\btsh\s*\(/];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(path)) out.push(path);
  }
  return out;
}

const flagged = [];
for (const root of ROOTS) {
  for (const path of walk(root)) {
    const source = readFileSync(path, "utf8");
    const sums = SUMS_SNAPSHOT.some((re) => re.test(source));
    const prints = PRINTS_LOCAL.some((re) => re.test(source));
    if (sums && prints && !CHECKED.has(path)) flagged.push(path);
  }
}

/* A name left behind after the file stopped doing either is also a problem:
   it is a promise about code that no longer exists, and the next file to be
   added under that name inherits an exemption nobody granted. */
const stale = [...CHECKED].filter((path) => {
  let source;
  try {
    source = readFileSync(path, "utf8");
  } catch {
    return true;
  }
  return !(
    SUMS_SNAPSHOT.some((re) => re.test(source)) &&
    PRINTS_LOCAL.some((re) => re.test(source))
  );
});

if (flagged.length === 0 && stale.length === 0) {
  console.log(
    "Every file that totals the dollar snapshot and prints shillings has been checked."
  );
  process.exit(0);
}

if (flagged.length > 0) {
  console.error(
    `\n${flagged.length} file(s) total amountUsd AND print shillings, and have not been checked:\n`
  );
  for (const path of flagged) console.error(`  ${path}`);
  console.error(
    "\nTotal the rows with sumShillings from lib/money-totals.ts and show that" +
      "\nfigure, or read the file and add it to CHECKED in this script.\n"
  );
}
if (stale.length > 0) {
  console.error(`\n${stale.length} name(s) in CHECKED no longer apply:\n`);
  for (const path of stale) console.error(`  ${path}`);
  console.error("\nRemove them, so the list stays a list of real promises.\n");
}
process.exit(1);
