/**
 * Draft an invoice for cargo that landed before auto-pricing existed.
 *
 * Check-in now raises a draft automatically, but everything already standing in
 * Dar arrived before that and carries no invoice at all — so Finance would open
 * the batch and find nothing to confirm.
 *
 * Uses the same code path as check-in, so it cannot drift from it: existing
 * confirmed or paid invoices are left alone, unpriceable cargo records the
 * reason instead, and the whole thing is safe to run twice.
 *
 *   npx tsx --conditions=react-server scripts/backfill-draft-invoices.mts
 *   npx tsx --conditions=react-server scripts/backfill-draft-invoices.mts --apply
 */
import { autoPriceShipments } from "@/lib/auto-price";
import { prisma } from "@/lib/prisma";

const apply = process.argv.includes("--apply");

// Cargo that is physically here or has already gone out. Anything still in the
// air is priced when it lands.
const cargo = await prisma.shipment.findMany({
  where: {
    deletedAt: null,
    status: { in: ["RECEIVED_AT_DAR", "READY_FOR_PICKUP", "DELIVERED"] },
  },
  select: {
    id: true,
    trackingNumber: true,
    invoice: { select: { invoiceNumber: true, status: true } },
  },
});

const needsDraft = cargo.filter(
  (s) => !s.invoice || s.invoice.status === "DRAFT"
);
const alreadyBilled = cargo.length - needsDraft.length;

console.log(
  `${cargo.length} consignments on or past the Dar floor.\n` +
    `  ${alreadyBilled} already carry a confirmed or paid invoice — untouched.\n` +
    `  ${needsDraft.length} would be drafted.\n`
);

if (!apply) {
  console.log("Dry run. Re-run with --apply to write.");
  await prisma.$disconnect();
  process.exit(0);
}

// Whoever ran the script owns the drafts, the same as the clerk who checks
// cargo in owns theirs.
const actor = await prisma.user.findFirstOrThrow({
  where: { role: "ADMIN" },
  select: { id: true, name: true },
});

const result = await autoPriceShipments(
  needsDraft.map((s) => s.id),
  actor.id
);

console.log(
  `drafted ${result.priced}  ·  skipped ${result.skipped}  ·  could not be priced ${result.blocked.length}`
);
for (const b of result.blocked.slice(0, 10)) {
  console.log(`  ${b.trackingNumber}: ${b.reason}`);
}
if (result.blocked.length > 10) {
  console.log(`  …and ${result.blocked.length - 10} more`);
}

await prisma.$disconnect();
