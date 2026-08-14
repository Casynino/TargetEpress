import "server-only";

import { prisma, type TxClient } from "@/lib/prisma";
import { toNumber } from "@/lib/format";

/**
 * Whether a flight's books can be shut, and what is stopping them.
 *
 * A batch that never closes is the problem the owner named: income and costs
 * pile onto it forever, nobody draws a line, and after a year of a weekly
 * schedule nothing on the board can be read as finished. Closing is that line.
 *
 * The test is money, not cargo. A consignment that is paid for but still
 * sitting in the warehouse belongs to the customer and does not hold the
 * flight open — chasing somebody to come and collect is a warehouse job, not a
 * reason to keep a set of books running. What holds it open is anything the
 * company is still owed, or has not asked for yet.
 *
 * Three ways a flight can still be owed something, and all three block:
 *   • a bill issued and not settled — the ordinary debt
 *   • a DRAFT — priced by the system, never shown to anybody, so nobody has
 *     been asked. Closing on a draft would write off money never demanded.
 *   • cargo with no invoice at all — the same thing, one step earlier.
 */
export type BatchOwing = {
  /** Cargo whose bill is issued and not settled. */
  unpaid: {
    shipmentId: string;
    invoiceId: string;
    trackingNumber: string;
    customerName: string;
    owedUsd: number;
  }[];
  /** Priced but never sent, so nobody has been asked for it. */
  drafts: number;
  /** Landed with no bill at all. */
  unbilled: number;
  /** Everything above, in dollars — what shutting the books would give up. */
  owedUsd: number;
  /** True when nothing is owed and nothing is unasked. */
  clear: boolean;
};

export async function batchOwing(
  batchId: string,
  client: TxClient | typeof prisma = prisma
): Promise<BatchOwing> {
  const cargo = await client.shipment.findMany({
    where: { batchId, deletedAt: null },
    select: {
      id: true,
      trackingNumber: true,
      customer: { select: { name: true } },
      invoice: {
        select: { id: true, status: true, total: true, amountPaid: true },
      },
    },
    orderBy: { trackingNumber: "asc" },
  });

  const unpaid: BatchOwing["unpaid"] = [];
  let drafts = 0;
  let unbilled = 0;

  for (const piece of cargo) {
    const invoice = piece.invoice;
    if (!invoice) {
      unbilled += 1;
      continue;
    }
    // Nothing is owed on either of these and neither is a loose end: a void
    // was a bill that should not have existed, a write-off is a debt somebody
    // already decided to give up on.
    if (invoice.status === "VOID" || invoice.status === "WRITTEN_OFF") continue;
    if (invoice.status === "DRAFT") {
      drafts += 1;
      continue;
    }
    const owed = toNumber(invoice.total) - toNumber(invoice.amountPaid);
    // A rounding tail of a fraction of a cent is not a debt.
    if (owed <= 0.005) continue;
    unpaid.push({
      shipmentId: piece.id,
      invoiceId: invoice.id,
      trackingNumber: piece.trackingNumber,
      customerName: piece.customer?.name ?? "—",
      owedUsd: owed,
    });
  }

  return {
    unpaid,
    drafts,
    unbilled,
    owedUsd: unpaid.reduce((sum, row) => sum + row.owedUsd, 0),
    clear: unpaid.length === 0 && drafts === 0 && unbilled === 0,
  };
}

/**
 * Statuses a flight can be closed from.
 *
 * Only one, and deliberately: VERIFIED means every piece has been checked off
 * the manifest in Dar. Closing a flight still in the air, or landed but not
 * counted, would shut the books on cargo nobody has laid eyes on — and a piece
 * found short after the close is exactly the thing a closed set of books
 * cannot absorb.
 */
export const CLOSEABLE_FROM = ["VERIFIED"] as const;

/**
 * Shut a flight's books the moment nothing is owed on it.
 *
 * Called after a payment settles a bill. Almost every flight will end this
 * way — the last customer pays, and the batch closes itself with nobody
 * deciding anything, which is the only version of this that will actually
 * happen every week. The manual close exists for the flights that do not.
 *
 * Runs inside the caller's transaction so a batch cannot be closed by a
 * payment that then fails to save.
 *
 * Returns true when it closed something, so the caller can say so.
 */
export async function settleBatchIfClear(
  tx: TxClient,
  batchId: string | null | undefined
): Promise<boolean> {
  if (!batchId) return false;

  const batch = await tx.batch.findUnique({
    where: { id: batchId },
    select: { id: true, status: true, permanent: true, closedAt: true },
  });
  // The two loading tables never close: they are furniture, not flights.
  if (!batch || batch.permanent || batch.closedAt) return false;
  if (!CLOSEABLE_FROM.includes(batch.status as (typeof CLOSEABLE_FROM)[number])) {
    return false;
  }

  const owing = await batchOwing(batchId, tx);
  if (!owing.clear) return false;

  await tx.batch.update({
    where: { id: batchId },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closeKind: "SETTLED",
      // No closedById: nobody closed it. Naming the clerk who happened to take
      // the last payment would read as a decision they did not make.
      closeNote: null,
    },
  });

  return true;
}
