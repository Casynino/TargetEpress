import "server-only";

import { prisma, type TxClient } from "@/lib/prisma";
import { toNumber } from "@/lib/format";
import { outstandingOf } from "@/lib/invoice-balance";
import { currentRateValue } from "@/lib/fx";

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
        select: { id: true, status: true, total: true, amountPaid: true, amountAdjusted: true },
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
    const owed = outstandingOf(invoice);
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

  /*
    A flight that shut itself still owes the boss a statement.

    Otherwise the only flights he ever reviews are the ones that went wrong,
    and the ones that went perfectly — every customer paid, nothing written
    off — would never appear on the sheet at all.

  */
  const statement = await buildStatement(
    tx,
    batchId,
    [],
    [],
    await currentRateValue()
  );
  /*
    Upsert, not create.

    A statement the boss sent back stays on the flight — that is how Finance
    reads his note. batchId is unique, so creating a second one throws, and
    this call sits inside the PAYMENT transaction: a customer settling the last
    bill on a previously-returned flight would have had their payment rolled
    back by a constraint error they had nothing to do with. Closing again
    replaces the statement and it goes up fresh.
  */
  await tx.batchStatement.upsert({
    where: { batchId },
    create: { batchId, ...statement, submittedById: null },
    update: {
      ...statement,
      status: "SUBMITTED",
      submittedById: null,
      submittedAt: new Date(),
      reviewedById: null,
      reviewedAt: null,
      reviewNote: null,
      note: null,
    },
  });

  return true;
}

/**
 * What a flight made, worked out once and written down.
 *
 * Called at the moment the books are shut, inside the same transaction, and
 * after the carried and written-off decisions have been applied — so the cargo
 * it counts is the cargo the flight is actually left with, and the two figures
 * it reports leaving are the ones that just left.
 *
 * Frozen on purpose. A payment that arrives next week is still recorded
 * against its invoice and still changes what the customer owes; it does not
 * rewrite what this flight was reported to have made, because the boss read
 * and signed that.
 */
export async function buildStatement(
  tx: TxClient,
  batchId: string,
  moved: { shipmentId: string; owedUsd: number }[],
  writtenOffIds: string[],
  rate: number | null
) {
  const cargo = await tx.shipment.findMany({
    where: { batchId, deletedAt: null },
    select: {
      id: true,
      weightKg: true,
      packages: true,
      customerId: true,
      invoice: { select: { id: true, status: true, total: true, amountPaid: true, amountAdjusted: true } },
    },
  });

  let kgReceived = 0;
  let receivedUsd = 0;
  let kgSold = 0;
  let soldUsd = 0;
  let collectedUsd = 0;
  let kgWrittenOff = 0;
  let writtenOffUsd = 0;
  let packages = 0;
  const customers = new Set<string>();

  const wroteOff = new Set(writtenOffIds);

  for (const piece of cargo) {
    const weight = toNumber(piece.weightKg);
    kgReceived += weight;
    packages += piece.packages;
    if (piece.customerId) customers.add(piece.customerId);

    const invoice = piece.invoice;
    if (!invoice || invoice.status === "VOID") continue;

    const total = toNumber(invoice.total);
    const paid = toNumber(invoice.amountPaid);
    collectedUsd += paid;

    if (wroteOff.has(invoice.id) || invoice.status === "WRITTEN_OFF") {
      kgWrittenOff += weight;
      writtenOffUsd += total - paid;
      // Only what came in before it was given up on was ever worth anything.
      receivedUsd += paid;
      continue;
    }

    receivedUsd += total;
    if (invoice.status === "PAID") {
      kgSold += weight;
      soldUsd += total;
    }
  }

  /*
    The cargo that moved is already gone from the query above — it was
    reassigned a moment ago — so its weight is fetched back deliberately. It
    belongs on this statement: the flight carried those kilos, and a sheet that
    silently dropped them would not add up against the manifest.
  */
  let kgCarried = 0;
  let carriedUsd = 0;
  if (moved.length > 0) {
    const gone = await tx.shipment.findMany({
      where: { id: { in: moved.map((row) => row.shipmentId) } },
      select: { id: true, weightKg: true, packages: true, customerId: true },
    });
    for (const piece of gone) {
      kgCarried += toNumber(piece.weightKg);
      // It flew on this batch, so it counts on this batch's manifest even
      // though it has just been moved off for chasing.
      packages += piece.packages;
      if (piece.customerId) customers.add(piece.customerId);
    }
    carriedUsd = moved.reduce((sum, row) => sum + row.owedUsd, 0);
    kgReceived += kgCarried;
  }

  const costs = await tx.expense.findMany({
    where: { batchId, status: { not: "VOID" }, expenseClass: "OPERATING" },
    select: { amountUsd: true, category: true },
  });
  const expensesUsd = costs.reduce((sum, c) => sum + toNumber(c.amountUsd), 0);

  /*
    The same total, split by what it was for.

    "USD 1,469 of costs" is a figure the boss can only accept or query; the
    same money as customs, transport, permits and the clearing agent is a
    figure he can read. Frozen with everything else — a category renamed next
    year must not rewrite a statement he has already signed.
  */
  const byCategory = new Map<string, number>();
  for (const cost of costs) {
    byCategory.set(
      cost.category,
      (byCategory.get(cost.category) ?? 0) + toNumber(cost.amountUsd)
    );
  }
  const expenseByCategory = [...byCategory.entries()]
    .map(([category, usd]) => ({ category, usd }))
    .sort((a, b) => b.usd - a.usd);


  return {
    pieces: cargo.length + moved.length,
    packages,
    customers: customers.size,
    kgReceived,
    receivedUsd,
    sellRate: kgReceived > 0 ? receivedUsd / kgReceived : null,
    /*
      What the flight made, from what it actually cost.

      This used to be billed minus a per-kilo freight-and-customs rate somebody
      typed at the close. The owner's call, and the right one: do not make
      people do extra steps, make it accurate. Customs was already recorded as
      a real expense with a receipt, so asking for it again as a rate counted
      the same money twice and the two never agreed. Every cost booked against
      the flight is subtracted here, and nothing is typed.
    */
    profitUsd: receivedUsd - expensesUsd,
    kgSold,
    soldUsd,
    collectedUsd,
    kgCarried,
    carriedUsd,
    kgWrittenOff,
    writtenOffUsd,
    expensesUsd,
    expenseByCategory,
    exchangeRate: rate,
  };
}
