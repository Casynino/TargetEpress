import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * WHAT THE CARGO WEIGHED WHEN IT WAS BOOKED, FOR A WHOLE LIST AT ONCE.
 *
 * The cargo page has always been able to say "China 248.4 → Dar 295.6": it
 * reads the change history for the one consignment it is showing. The lists
 * could not, because doing that per row is a query per row, so a flight of
 * sixty-two and the collections queue said nothing at all — and those are
 * exactly the screens where a re-weighed consignment needs to stand out,
 * because the price beside it was worked out on one of the two figures.
 *
 * One query for the whole page. The FIRST change is what the packing list
 * claimed — later corrections are corrections of a figure Dar had already
 * written — and the current weight is on the row the caller already has.
 *
 * `Shipment.declaredWeightKg` answers the same question for cargo checked in
 * since it existed, and is preferred by the caller where it is set: it is one
 * column on a row already being read. This is the answer for everything
 * older, which is most of what is on the floor today.
 */
export async function bookedWeights(
  shipmentIds: string[]
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (shipmentIds.length === 0) return out;

  const rows = await prisma.fieldChange.findMany({
    where: {
      entity: "Shipment",
      entityId: { in: shipmentIds },
      field: "weightKg",
    },
    orderBy: { createdAt: "asc" },
    select: { entityId: true, before: true },
  });

  for (const row of rows) {
    /* The first one only: after that, `before` is a figure this floor wrote,
       not what Guangzhou declared. */
    if (out.has(row.entityId)) continue;
    const kg = Number(row.before);
    if (Number.isFinite(kg) && kg > 0) out.set(row.entityId, kg);
  }
  return out;
}
