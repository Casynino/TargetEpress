/**
 * Gives every existing shipment its package rows.
 *
 * The 125 shipments registered before packages existed each recorded a count
 * ("5 cartons") but no individual boxes. This creates one Package per counted
 * item, numbered from 1, so the warehouse can scan them like anything else.
 *
 * Safe to run twice: a shipment that already has the right number of packages
 * is skipped, and one that is short only gets the missing tail.
 */
import { prisma } from "../lib/prisma";
import { generateQrToken, packageReference } from "../lib/ids";

async function main() {
  const shipments = await prisma.shipment.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      trackingNumber: true,
      packages: true,
      packageList: { select: { sequence: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  let created = 0;
  let touched = 0;

  for (const shipment of shipments) {
    const have = new Set(shipment.packageList.map((p) => p.sequence));
    const missing: number[] = [];
    for (let seq = 1; seq <= Math.max(1, shipment.packages); seq += 1) {
      if (!have.has(seq)) missing.push(seq);
    }
    if (missing.length === 0) continue;

    await prisma.package.createMany({
      data: missing.map((sequence) => ({
        shipmentId: shipment.id,
        sequence,
        reference: packageReference(shipment.trackingNumber, sequence),
        qrToken: generateQrToken(),
      })),
      skipDuplicates: true,
    });
    created += missing.length;
    touched += 1;
  }

  const total = await prisma.package.count();
  const distinctTokens = await prisma.package.findMany({ select: { qrToken: true } });
  const unique = new Set(distinctTokens.map((p) => p.qrToken)).size;

  console.log(`Shipments seen:   ${shipments.length}`);
  console.log(`Shipments filled: ${touched}`);
  console.log(`Packages created: ${created}`);
  console.log(`Packages total:   ${total}`);
  console.log(`Unique QR tokens: ${unique} ${unique === total ? "✓" : "✗ COLLISION"}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
