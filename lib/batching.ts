import "server-only";

import type { Origin, Prisma } from "@prisma/client";

import { toNumber } from "@/lib/format";
import { nextRouteBatchNumber } from "@/lib/ids";

/**
 * Which batch a shipment goes on — decided by the system, never by a clerk.
 *
 * The China desk answers one question: what is this cargo? Everything after
 * that is arithmetic. The cargo category fixes the route, the route fixes the
 * batch, and if no batch is open for that route the system opens one.
 *
 * This exists because the alternative is a dropdown, and a dropdown of batch
 * numbers is an invitation to put electronics on the Guangzhou flight at the
 * end of a long shift. The warehouse cannot make that mistake if it is never
 * asked to make that choice.
 *
 * Everything here takes a transaction client and must be called inside one:
 * "find the open batch, or create it" is a read followed by a write, and two
 * clerks registering cargo at the same moment must not create two batches.
 */

export type BatchAssignment = {
  batchId: string;
  batchNumber: string;
  /** True when this shipment caused a new batch to be opened. */
  created: boolean;
  /** Set when a batch was closed off as FULL to make way for this one. */
  sealedFull: string | null;
};

/** Has this batch hit a limit the operator set on it? */
function isAtCapacity(
  batch: {
    maxShipments: number | null;
    maxWeightKg: Prisma.Decimal | null;
    maxPackages: number | null;
  },
  loaded: { shipments: number; weightKg: number; packages: number }
) {
  if (batch.maxShipments !== null && loaded.shipments >= batch.maxShipments) {
    return true;
  }
  if (
    batch.maxWeightKg !== null &&
    loaded.weightKg >= toNumber(batch.maxWeightKg)
  ) {
    return true;
  }
  if (batch.maxPackages !== null && loaded.packages >= batch.maxPackages) {
    return true;
  }
  return false;
}

/**
 * The open batch for a route, opening one if there is not.
 *
 * `incoming` is the shipment about to be added, so capacity is judged on what
 * the batch will hold once it lands rather than what it holds now — a 400 kg
 * batch with a 500 kg limit should not accept a 200 kg shipment.
 */
export async function assignToOpenBatch(
  tx: Prisma.TransactionClient,
  route: Origin,
  incoming: { weightKg: number; packages: number },
  actorId?: string | null
): Promise<BatchAssignment> {
  const open = await tx.batch.findFirst({
    where: { origin: route, status: "OPEN" },
    // Oldest first: fill the batch that has been waiting longest, so cargo does
    // not sit in China while newer batches fly.
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      batchNumber: true,
      maxShipments: true,
      maxWeightKg: true,
      maxPackages: true,
    },
  });

  let sealedFull: string | null = null;

  if (open) {
    const loaded = await tx.shipment.aggregate({
      where: { batchId: open.id },
      _count: { _all: true },
      _sum: { weightKg: true, packages: true },
    });

    const after = {
      shipments: (loaded._count?._all ?? 0) + 1,
      weightKg: toNumber(loaded._sum?.weightKg ?? 0) + incoming.weightKg,
      packages: (loaded._sum?.packages ?? 0) + incoming.packages,
    };

    if (!isAtCapacity(open, after)) {
      return {
        batchId: open.id,
        batchNumber: open.batchNumber,
        created: false,
        sealedFull: null,
      };
    }

    // It would overflow. Close it off and open the next one.
    await tx.batch.update({ where: { id: open.id }, data: { status: "FULL" } });
    sealedFull = open.batchNumber;
  }

  const batch = await tx.batch.create({
    data: {
      batchNumber: await nextRouteBatchNumber(tx, route),
      origin: route,
      status: "OPEN",
      createdById: actorId ?? null,
    },
    select: { id: true, batchNumber: true },
  });

  return {
    batchId: batch.id,
    batchNumber: batch.batchNumber,
    created: true,
    sealedFull,
  };
}
