/**
 * Does the money add up?
 *
 *   npx tsx scripts/finance-check.mts
 *   npx tsx scripts/finance-check.mts --batch GZ/26-28
 *
 * Every figure Finance reads on a screen is computed by application code. This
 * recomputes the same figures straight from the rows underneath and compares
 * the two. It is deliberately NOT a unit test of those functions: it is a second
 * opinion, written from the database rather than from the code, so a mistake in
 * the display layer shows up as a disagreement rather than as a number that
 * merely looks plausible.
 *
 * A disagreement is a defect in one of the two. Which one it is takes reading;
 * the point of this script is that nobody finds out from a customer.
 */

import { batchFinance } from "../lib/batch-finance";
import { toNumber } from "../lib/format";
import { prisma } from "../lib/prisma";

const TOLERANCE = 0.01; // cents; Decimal -> float rounding, nothing more

type Check = {
  scope: string;
  label: string;
  app: number;
  recomputed: number;
};

const checks: Check[] = [];
const notes: string[] = [];

function compare(scope: string, label: string, app: number, recomputed: number) {
  checks.push({ scope, label, app, recomputed });
}

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ------------------------------------------------------------------ batches */

async function checkBatch(batchNumber: string, batchId: string) {
  const app = await batchFinance(batchId);

  const cargo = await prisma.shipment.findMany({
    where: { batchId, deletedAt: null },
    select: {
      weightKg: true,
      customerId: true,
      invoice: {
        select: {
          total: true,
          amountPaid: true,
          status: true,
        },
      },
    },
  });

  compare(batchNumber, "pieces", app.pieces, cargo.length);

  compare(
    batchNumber,
    "customers",
    app.customers,
    new Set(cargo.map((c) => c.customerId).filter(Boolean)).size
  );

  /*
    Confirmed bills only.

    DRAFT is the system's own price, not something a customer has been asked
    for, and VOID is a bill that was withdrawn. Counting either as revenue is
    how a batch reads as profitable before anyone has agreed to pay for it.
  */
  const confirmed = cargo.filter(
    (c) => c.invoice && c.invoice.status !== "DRAFT" && c.invoice.status !== "VOID"
  );

  /*
    A written-off bill counts only for what was actually collected before it
    was given up on.

    The remainder left revenue when the batch closed — that is the whole point
    of writing it off, and it is why a flight that abandoned a fifth of its
    billing shows a smaller profit than one that collected everything. Recorded
    here as its own rule rather than by trusting the app's arithmetic, which is
    the only reason this script is worth running.
  */
  const billedOn = (invoice: { status: string; total: unknown; amountPaid: unknown }) =>
    invoice.status === "WRITTEN_OFF"
      ? toNumber(invoice.amountPaid as never)
      : toNumber(invoice.total as never);

  const billed = confirmed.reduce((n, c) => n + billedOn(c.invoice!), 0);
  compare(batchNumber, "billed (confirmed invoices)", app.billedUsd, billed);

  const paid = confirmed.reduce((n, c) => n + toNumber(c.invoice!.amountPaid), 0);
  compare(batchNumber, "collected", app.receivedUsd, paid);

  const writtenOff = confirmed
    .filter((c) => c.invoice!.status === "WRITTEN_OFF")
    .reduce(
      (n, c) => n + toNumber(c.invoice!.total) - toNumber(c.invoice!.amountPaid),
      0
    );
  compare(batchNumber, "written off", app.writtenOffUsd, writtenOff);

  // Nobody owes an estimate, so outstanding is measured against what was billed.
  compare(batchNumber, "outstanding", app.outstandingUsd, Math.max(0, billed - paid));

  const drafts = cargo.filter((c) => c.invoice?.status === "DRAFT").length;
  compare(batchNumber, "draft invoices", app.drafts, drafts);

  /*
    Expected revenue is billed plus an estimate for cargo not yet invoiced, and
    the estimate comes from the live rate book — so it cannot be recomputed here
    without reimplementing pricing, which would only prove the copy matches the
    copy. What CAN be checked is the identity the two halves must satisfy.
  */
  compare(
    batchNumber,
    "expected = invoiced + estimated",
    app.expectedUsd,
    app.invoicedUsd + app.estimatedUsd
  );

  const expenses = await prisma.expense.findMany({
    where: { batchId, status: { not: "VOID" } },
    select: { amountUsd: true },
  });
  const spend = expenses.reduce((n, e) => n + toNumber(e.amountUsd), 0);

  if (expenses.length === 0) {
    notes.push(
      `${batchNumber}: no expenses recorded, so profit for this flight is revenue with nothing taken off it.`
    );
  }

  // Reported here rather than compared, until the batch P&L is wired up.
  notes.push(
    `${batchNumber}: billed ${money(billed)}, collected ${money(paid)}, ` +
      `outstanding ${money(Math.max(0, billed - paid))}, expenses ${money(spend)}, ` +
      `net ${money(billed - spend)}`
  );
}

/* ------------------------------------------------------------------- ledger */

async function checkLedger() {
  const accounts = await prisma.companyAccount.findMany({
    select: { id: true, name: true, currency: true },
  });

  for (const account of accounts) {
    const entries = await prisma.ledgerEntry.findMany({
      where: { accountId: account.id },
      select: { direction: true, amount: true },
    });
    if (entries.length === 0) continue;

    const inflow = entries
      .filter((e) => e.direction === "IN")
      .reduce((n, e) => n + toNumber(e.amount), 0);
    const outflow = entries
      .filter((e) => e.direction === "OUT")
      .reduce((n, e) => n + toNumber(e.amount), 0);

    notes.push(
      `${account.name}: ${entries.length} entries, in ${money(inflow)}, ` +
        `out ${money(outflow)}, balance ${money(inflow - outflow)} ${account.currency}`
    );
  }

  /*
    Every payment that named an account should have left a line in the ledger.
    A money movement with no ledger entry is invisible to every report built on
    the ledger, which is the whole point of having one.

    Measured against payments that named an account, not against every payment.
    The capture form allows a payment with no account — money taken at the
    counter before anybody decides which till it went into — and there is
    genuinely no line to write until it does. Counting those as missing made
    this check fail on correct behaviour, which is worse than not having it.
    They are reported separately below, because money sitting in no account is
    still money nothing in the ledger can see.
  */
  /*
    Counted as LIVE lines, not as rows.

    Cancelling a payment leaves the original line where it is and answers it
    with a reversing one, and reinstating it posts a third — all three of those
    things happened, and the register says so. So the count of rows is not the
    count of payments and never was; what has to match is the number of
    payments against the number of lines that have not been reversed and are
    not themselves reversals.
  */
  const payments = await prisma.payment.count({
    where: { accountId: { not: null }, voidedAt: null },
  });
  const paymentLines = await prisma.ledgerEntry.count({
    where: {
      kind: "CUSTOMER_PAYMENT",
      reversesId: null,
      reversedBy: { is: null },
      /* Belonging to a payment that still exists and still counts. A line
         answering nothing is its own fault, reported separately below. */
      payment: { is: { voidedAt: null } },
    },
  });
  compare("ledger", "live payments with a live ledger line", paymentLines, payments);

  /* A money line that names no record is money nobody can explain. */
  const strandedLines = await prisma.ledgerEntry.count({
    where: {
      kind: "CUSTOMER_PAYMENT",
      reversesId: null,
      reversedBy: { is: null },
      paymentId: null,
    },
  });
  compare("ledger", "payment lines naming no payment", strandedLines, 0);

  const unattributed = await prisma.payment.count({ where: { accountId: null } });
  if (unattributed > 0) {
    notes.push(
      `${unattributed} payment(s) named no account, so no ledger line exists for them yet. ` +
        `The money is recorded against the invoice; it is not in any account balance.`
    );
  }

  /*
    Measured on paidAt, not on status.

    A cost that was paid and later reversed is VOID, but its original ledger
    line stays exactly where it was — that is the whole point of correcting by
    reversal rather than by deletion. Counting PAID rows made this check report
    a discrepancy the first time a reversal happened, which is the check being
    wrong rather than the books.
  */
  const everPaid = await prisma.expense.count({
    where: { paidAt: { not: null }, status: { not: "VOID" } },
  });
  const expenseLines = await prisma.ledgerEntry.count({
    where: { kind: "EXPENSE", reversesId: null, reversedBy: { is: null } },
  });
  compare("ledger", "live costs paid, with a live ledger line", expenseLines, everPaid);

  /*
    Every reversal answers exactly one entry — and this counted ALL reversals
    against cancelled COSTS alone, so a cancelled payment made it fail. Each
    kind is now checked against its own.
  */
  /*
    A CANCELLED COST LEAVES NOTHING IN AN ACCOUNT.

    Counting reversals against cancelled costs was never the invariant, and it
    could not be: correcting a cost's figure also reverses its line and posts a
    replacement, so a live cost can legitimately have a reversal behind it. And
    a cost's reversal is posted as an ADJUSTMENT going the other way — the
    register reads "correction of EXP-2026-000004", which is what it is — so
    counting by kind found none of them either.

    What actually has to hold is this: a cost that was paid and then cancelled
    has no live line left anywhere. If it has, the money is still out of an
    account that got it back.
  */
  const strandedCosts = await prisma.expense.count({
    where: {
      status: "VOID",
      paidAt: { not: null },
      ledgerEntry: { is: { reversesId: null, reversedBy: { is: null } } },
    },
  });
  compare("ledger", "cancelled costs still in an account", strandedCosts, 0);

  /*
    Payments are not one-for-one: cancel, reinstate, cancel leaves two
    reversals against one payment, all of them true. What must hold is that
    every payment ever cancelled has at least one reversal behind it, and that
    no reversal answers a payment that is still live.
  */
  const orphanReversals = await prisma.ledgerEntry.count({
    where: {
      kind: "CUSTOMER_PAYMENT",
      reversesId: { not: null },
      payment: { is: { voidedAt: null } },
    },
  });
  compare("ledger", "reversals against a live payment", orphanReversals, 0);
}

/* --------------------------------------------------------------------- main */

const wanted = process.argv.includes("--batch")
  ? process.argv[process.argv.indexOf("--batch") + 1]
  : null;

const batches = await prisma.batch.findMany({
  where: wanted ? { batchNumber: wanted } : {},
  select: { id: true, batchNumber: true },
  orderBy: { createdAt: "desc" },
});

if (batches.length === 0) {
  console.error(wanted ? `No batch ${wanted}.` : "No batches to check.");
  process.exit(1);
}

for (const batch of batches) await checkBatch(batch.batchNumber, batch.id);
await checkLedger();
await prisma.$disconnect();

const failed = checks.filter(
  (c) => Math.abs(c.app - c.recomputed) > TOLERANCE
);

console.log(`\n${checks.length} figures checked against the rows underneath them\n`);
for (const c of checks) {
  const ok = Math.abs(c.app - c.recomputed) <= TOLERANCE;
  console.log(
    `  ${ok ? "ok  " : "FAIL"}  ${c.scope.padEnd(12)} ${c.label.padEnd(34)}` +
      (ok ? money(c.app) : `app ${money(c.app)} vs rows ${money(c.recomputed)}`)
  );
}

if (notes.length) {
  console.log("\nfor information:");
  for (const n of notes) console.log(`  ${n}`);
}

if (failed.length) {
  console.error(`\n${failed.length} figure(s) disagree with the data underneath.`);
  process.exit(1);
}
console.log("\nEvery figure agrees with the rows underneath it.");
