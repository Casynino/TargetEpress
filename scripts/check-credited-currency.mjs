/**
 * The dollar column must hold dollars.
 *
 *   node scripts/check-credited-currency.mjs
 *
 * `Payment.amount` is what the customer handed over, in `Payment.currency`.
 * `Payment.creditedAmount` is THE SAME MONEY IN THE BILL'S CURRENCY, and bills
 * are written in USD. Every collected and revenue figure in the app reads that
 * column as `COALESCE("creditedAmount", "amount")` and takes it for dollars.
 *
 * So a shilling figure left in it is not a rounding — it is that payment
 * counted at 2,700 times its size in the company's takings. This asks the
 * database whether any row is shaped like that.
 *
 * It found one class of them: a deposit taken with no bill ticked fell back to
 * "the bill currency is whatever the customer paid in", because there was no
 * bill to ask. See recordCustomerPayment.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const rows = await prisma.payment.findMany({
  where: { creditedAmount: { not: null } },
  select: {
    id: true,
    amount: true,
    /* The half that answers no bill — see the note where it is subtracted. */
    transportAmount: true,
    currency: true,
    creditedAmount: true,
    exchangeRate: true,
    createdAt: true,
    receipt: { select: { receiptNumber: true } },
  },
  orderBy: { createdAt: "desc" },
});

const n = (v) => (v === null || v === undefined ? null : Number(v));
const bad = [];

for (const p of rows) {
  const amount = n(p.amount);
  const credited = n(p.creditedAmount);
  const rate = n(p.exchangeRate);
  const name = p.receipt?.receiptNumber ?? p.id;

  /*
    THE FARE IS NOT CREDITED TO ANY BILL.

    `amount` is what the customer handed across the counter, and on a delivery
    that is the freight PLUS the driver's fare. Only the freight half settles
    a bill, so that is the half `creditedAmount` holds — the fare leaves again
    on its own ledger leg.

    This check compared the credited figure against the WHOLE transfer, so the
    first payment ever taken with a fare in a currency other than the bill's
    was reported as holding the wrong currency. It held exactly the right
    figure; the arithmetic here was missing a term.
  */
  const forBills = amount - (n(p.transportAmount) ?? 0);

  if (p.currency === "USD") {
    /* Paid in the bill's own currency: the two must agree. */
    if (Math.abs(credited - forBills) > 0.01) {
      bad.push(`${name}: paid USD ${forBills} to bills but credited ${credited}`);
    }
    continue;
  }

  /* Paid in shillings. The credited figure is that money in dollars, so it
     must be the freight half divided by the rate — never the amount itself. */
  if (rate && rate > 0) {
    const expected = forBills / rate;
    /* A cent of tolerance, plus the deliberate snap-to-outstanding the credit
       helper applies when a conversion lands within a cent of the balance. */
    if (Math.abs(credited - expected) > 0.02) {
      bad.push(
        `${name}: TZS ${forBills} to bills at ${rate} should credit ~${expected.toFixed(2)}, stored ${credited}`
      );
    }
  } else if (amount > 1000 && Math.abs(credited - amount) < 0.01) {
    /* No rate stored and the two figures are identical at a shilling
       magnitude: the shillings were written into the dollar column. */
    bad.push(`${name}: TZS ${amount} stored as ${credited} with no rate — shillings in the dollar column`);
  }
}

console.log(`${rows.length} payment(s) with a credited figure checked.`);
if (bad.length === 0) {
  console.log("Every credited amount is stated in the bill's currency.");
} else {
  console.log(`\n${bad.length} payment(s) hold the wrong currency:`);
  for (const b of bad) console.log(`  ${b}`);
}

await prisma.$disconnect();
process.exit(bad.length === 0 ? 0 : 1);
