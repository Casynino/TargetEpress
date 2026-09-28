/**
 * EVERY BILL STILL STANDING ON A WEIGHT THE CARGO NO LONGER IS.
 *
 *   npx tsx --conditions=react-server scripts/reprice-old-weights.mts            # look
 *   npx tsx --conditions=react-server scripts/reprice-old-weights.mts --apply    # do it
 *
 * A corrected weight re-prices the bill by itself now. This is the catch-up
 * for everything corrected BEFORE that was true: consignments booked at one
 * figure, weighed at another on the Dar floor, and billed on the first —
 * because at the time nothing carried the new weight through to the money.
 * Nobody is going to edit those weights again, so the bills would stand wrong
 * for ever, and the owner's rule is that no desk should have to go and press
 * a button on each of them.
 *
 * It runs the same code a weight edit runs, so it cannot do anything the
 * ordinary path would not:
 *   - a bill with money against it is never touched;
 *   - a rate Finance agreed survives, and only the kilos move;
 *   - every bill it moves gets a price-change row Finance can see and undo.
 *
 * A dry run by default, because this moves real money on real bills.
 */
import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { repriceForWeight } from "@/lib/reprice-weight";

const apply = process.argv.includes("--apply");

/* Who it is recorded as. The owner, because this is his instruction carried
   out, and because a price-change row with nobody against it cannot be read
   back six months later. */
const actor = await prisma.user.findFirst({
  where: { role: "ADMIN", active: true },
  select: { id: true, name: true },
});
if (!actor) throw new Error("No owner account to record this against.");

/* Cargo whose bill nobody has paid, priced by the kilo, where what the
   freight was worked out on is not what the cargo weighs. The engine checks
   all of that again per consignment; this is only to keep the run small. */
const candidates = await prisma.shipment.findMany({
  where: {
    deletedAt: null,
    quotedMethod: "WEIGHT_BASED",
    invoice: { status: "UNPAID", amountPaid: 0, amountAdjusted: 0 },
  },
  select: {
    id: true,
    trackingNumber: true,
    weightKg: true,
    chargeableKg: true,
    invoice: {
      select: { invoiceNumber: true, total: true, currency: true, freightRateQuantity: true },
    },
  },
});

const stale = candidates.filter((s) => {
  const billedOn =
    s.invoice?.freightRateQuantity !== null && s.invoice?.freightRateQuantity !== undefined
      ? toNumber(s.invoice.freightRateQuantity)
      : s.chargeableKg === null
        ? null
        : toNumber(s.chargeableKg);
  if (billedOn === null) return false;
  return Math.abs(billedOn - Math.max(toNumber(s.weightKg), 1)) > 0.005;
});

console.log(
  `\n${candidates.length} unpaid bill(s) priced by the kilo · ${stale.length} standing on an old weight\n`
);
for (const s of stale) {
  const billedOn =
    s.invoice?.freightRateQuantity !== null && s.invoice?.freightRateQuantity !== undefined
      ? toNumber(s.invoice.freightRateQuantity)
      : toNumber(s.chargeableKg ?? 0);
  console.log(
    `  ${s.trackingNumber}  ${s.invoice!.invoiceNumber}  billed on ${billedOn} kg · weighs ${toNumber(s.weightKg)} kg · ${s.invoice!.currency} ${toNumber(s.invoice!.total).toFixed(2)}`
  );
}

if (!apply) {
  console.log(
    `\nNothing changed. Run it again with --apply to put these on the weight they are.\n`
  );
  await prisma.$disconnect();
  process.exit(0);
}

/* In batches, so one long transaction never holds the whole floor. */
const SIZE = 25;
let moved = 0;
let held = 0;
let blocked = 0;
for (let i = 0; i < stale.length; i += SIZE) {
  const batch = stale.slice(i, i + SIZE).map((s) => s.id);
  const result = await repriceForWeight(batch, actor.id);
  for (const row of result.moved) {
    console.log(
      `  ✓ ${row.trackingNumber}  ${row.currency} ${row.before.toFixed(2)} → ${row.after.toFixed(2)}`
    );
  }
  for (const row of result.held) {
    console.log(`  · ${row.trackingNumber} left alone — ${row.status}`);
  }
  for (const row of result.blocked) {
    console.log(`  ! ${row.trackingNumber} — ${row.reason}`);
  }
  moved += result.moved.length;
  held += result.held.length;
  blocked += result.blocked.length;
}

console.log(
  `\n${moved} bill(s) put on the weight they are · ${held} left alone · ${blocked} the rate book could not price\n` +
    `Recorded against ${actor.name}. Finance sees every one of them in the price-change queue and can undo any of them.\n`
);
await prisma.$disconnect();
