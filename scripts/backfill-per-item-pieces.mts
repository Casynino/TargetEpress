/**
 * Re-label cargo that is billed per item so it is counted in pieces.
 *
 * Registration now forces this (lib/actions/shipments.ts), but records created
 * before that could carry "8 packages" while the invoice charged for 8 cameras.
 * The arithmetic was already treating the number as items — this only makes the
 * label agree with the charge, so no price moves.
 *
 * Safe to run more than once: it only touches rows that are still wrong.
 *
 *   npx tsx --conditions=react-server scripts/backfill-per-item-pieces.mts
 *   npx tsx --conditions=react-server scripts/backfill-per-item-pieces.mts --apply
 */
import { toNumber } from "@/lib/format";
import { quote } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

const apply = process.argv.includes("--apply");

const candidates = await prisma.shipment.findMany({
  where: { deletedAt: null, packageType: { not: "PIECE" } },
  select: {
    id: true,
    trackingNumber: true,
    packageType: true,
    packages: true,
    weightKg: true,
    cargoCategory: true,
    cargoTypeId: true,
    cargoType: { select: { name: true } },
  },
});

const wrong: typeof candidates = [];

for (const s of candidates) {
  const priced = await quote({
    category: s.cargoCategory,
    cargoTypeId: s.cargoTypeId,
    weightKg: toNumber(s.weightKg),
    quantity: s.packages,
  });
  if (priced.ok && priced.method === "FIXED_PER_ITEM") wrong.push(s);
}

console.log(
  `${candidates.length} consignments not counted in pieces; ${wrong.length} of them are billed per item.\n`
);
for (const s of wrong) {
  console.log(
    `  ${s.trackingNumber}  ${s.cargoType?.name ?? "(no product)"}  ${s.packages} ${s.packageType} → ${s.packages} PIECE`
  );
}

if (!apply) {
  console.log(
    `\nDry run. Re-run with --apply to write. No charge changes either way — the count is unchanged.`
  );
} else if (wrong.length > 0) {
  const { count } = await prisma.shipment.updateMany({
    where: { id: { in: wrong.map((s) => s.id) } },
    data: { packageType: "PIECE" },
  });
  console.log(`\nRe-labelled ${count} consignment(s).`);
} else {
  console.log("\nNothing to do.");
}

await prisma.$disconnect();
