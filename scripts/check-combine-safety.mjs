/**
 * WHAT COMBINING IS ALLOWED TO TOUCH.
 *
 *   node scripts/check-combine-safety.mjs
 *
 * The feature's whole promise is that it records a physical fact and moves no
 * money. That promise is kept by the action writing to exactly two places, so
 * this reads the action itself and fails if it ever learns to write anywhere
 * else. A test can only check the cases somebody thought of; this checks the
 * shape, which is what actually makes the guarantee.
 */
import { readFileSync } from "node:fs";

const src = readFileSync("lib/actions/combine-packages.ts", "utf8");
let bad = 0;
const fail = (m) => { console.log(`   ✗ ${m}`); bad++; };
const ok = (m) => console.log(`   ✓ ${m}`);

/* 1. The only tables it may write. */
const writes = [...src.matchAll(/tx\.(\w+)\.(create|update|updateMany|delete|deleteMany|upsert|createMany)\b/g)]
  .map((m) => `${m[1]}.${m[2]}`);
const allowed = new Set([
  "packageCombination.create",
  "packageCombination.updateMany",
  "package.updateMany",
  "shipmentStatusHistory.create",
]);
const strays = [...new Set(writes)].filter((w) => !allowed.has(w));
strays.length === 0
  ? ok(`writes only to ${[...new Set(writes)].sort().join(", ")}`)
  : fail(`writes somewhere it must not: ${strays.join(", ")}`);

/* 2. EVERY WEIGHT, COUNT AND PRICE LIVES ON Shipment OR Invoice.
      So the guarantee is not "it avoids those columns" — which a later edit
      could undo without anybody noticing — it is that the action never writes
      to either table at all. Reads are fine and necessary; writes are not. */
const moneyTables = ["shipment", "invoice", "payment", "ledgerEntry", "expense"];
const writesMoney = moneyTables.filter((tbl) =>
  new RegExp(`tx\\.${tbl}\\.(create|update|updateMany|delete|deleteMany|upsert|createMany)\\b`).test(src)
);
writesMoney.length === 0
  ? ok("never writes to Shipment, Invoice, Payment, LedgerEntry or Expense — where every weight, count and price lives")
  : fail(`writes to a table that holds money or pricing: ${writesMoney.join(", ")}`);

/* 3. It must not be able to reach the pricing engine at all. */
[/autoPriceShipments/, /\bquote\s*\(/, /postLedgerEntry/, /generateInvoice/].forEach((re) => {
  re.test(src) ? fail(`reaches ${re} — the combine must never price or post`) : null;
});
ok("never calls the pricing engine or the ledger");

/* 4. It authorises itself, like every other server action. */
/await authorize\(/.test(src) ? ok("authorises itself") : fail("no authorize() call");

/* 5. The same-customer rule is enforced in the transaction, not just the form. */
/customerIds\.size > 1/.test(src)
  ? ok("refuses two customers inside the transaction")
  : fail("the same-customer rule is not enforced server-side");

/* 6. The claim that closes the two-clerks race. */
/combinationId: null[\s\S]{0,400}claimed\.count !== ids\.length/.test(src)
  ? ok("claims the boxes conditionally, so two clerks cannot both win")
  : fail("no conditional claim — two desks could combine the same box");

console.log(
  bad === 0
    ? "\nCombining can touch nothing but its own record and the pointer on each box."
    : `\n${bad} problem(s) — combining could move something it must not.`
);
process.exit(bad === 0 ? 0 : 1);
