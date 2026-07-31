import "server-only";

import type { Origin, Prisma } from "@prisma/client";

/**
 * Where newly received cargo lands — decided by the system, never by a clerk.
 *
 * There are exactly two loading tables, one per route, and they are permanent.
 * The China desk answers one question: what is this cargo? The category fixes
 * the route, and the route fixes the loading table. Nothing is created, nothing
 * is chosen, nothing can be got wrong.
 *
 * This replaced a batch dropdown. A dropdown of batch numbers is an invitation
 * to put electronics on the Guangzhou flight at the end of a long shift; the
 * warehouse cannot make that mistake if it is never asked to make that choice.
 */

export type BatchAssignment = {
  batchId: string;
  batchNumber: string;
};

/**
 * The loading table for a route.
 *
 * Throws rather than creating one. Exactly two exist, seeded once by
 * prisma/seed-loading-tables.ts; if one is missing that is a broken install,
 * and quietly inventing a third would hide it.
 */
export async function assignToLoadingTable(
  tx: Prisma.TransactionClient,
  route: Origin
): Promise<BatchAssignment> {
  const table = await tx.batch.findFirst({
    where: { origin: route, permanent: true },
    select: { id: true, batchNumber: true },
  });

  if (!table) {
    throw new Error(
      `No loading table exists for ${route}. Run prisma/seed-loading-tables.ts.`
    );
  }

  return { batchId: table.id, batchNumber: table.batchNumber };
}

/** Both loading tables with what is waiting on them right now. */
export async function loadingTables(prisma: Prisma.TransactionClient) {
  return prisma.batch.findMany({
    where: { permanent: true },
    orderBy: { origin: "asc" },
    select: {
      id: true,
      batchNumber: true,
      origin: true,
      _count: { select: { shipments: true } },
    },
  });
}
