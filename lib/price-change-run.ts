import "server-only";

import { prisma } from "@/lib/prisma";
import { AUTO_WEIGHT_REASON } from "@/lib/price-changes";
import { toNumber } from "@/lib/format";

/**
 * THE CHANGE A DESK IS STILL STANDING IN FRONT OF.
 *
 * Two different things end a price change's life, and they used to be the
 * same thing. Finance ticking "this price is fine" settles a price SOMEBODY
 * AGREED — the argument is over, and re-opening it behind their back would
 * undo their decision. It settles nothing about a price the rate book worked
 * out by itself because the warehouse put the box on a scale: nobody argued
 * about that one, and the desk that next picks the bill up still needs to be
 * told the figure moved, and still needs the one press that puts it back.
 *
 * So an automatic re-price stays standing until money lands on the bill.
 * Paid is where it stops: from then on the figure is what somebody was
 * actually charged, and moving it is a ledger correction, not an undo.
 *
 * The owner, three times in one day: the undo has to be simple, and it has to
 * be there wherever the change is read.
 */
export type PriceChangeRow = {
  id: string;
  status: string;
  reason: string | null;
  changedAt: Date;
};

export function standingRun<T extends PriceChangeRow>(
  changes: T[],
  opts: { paid: boolean }
): { run: T[]; automatic: boolean; reviewed: boolean } {
  const newestFirst = [...changes].sort(
    (a, b) => b.changedAt.getTime() - a.changedAt.getTime()
  );

  /* Anything nobody has looked at comes first and is the run, exactly as it
     always was — a desk that mistyped and corrected itself is one run, not
     three, so this is the whole unchecked set and not the newest row. */
  const unseen = newestFirst.filter((change) => change.status === "UNSEEN");
  if (unseen.length > 0) {
    return {
      run: unseen.reverse(),
      automatic: unseen.every((c) => c.reason === AUTO_WEIGHT_REASON),
      reviewed: false,
    };
  }

  if (opts.paid) return { run: [], automatic: false, reviewed: false };

  /* Otherwise the most recent automatic run, and only if it is still the last
     thing that happened to this price: a typed change or a restore after it
     means somebody has since had their say, and the bill is theirs now. */
  const tail: T[] = [];
  for (const change of newestFirst) {
    if (change.status !== "CONFIRMED" || change.reason !== AUTO_WEIGHT_REASON) {
      break;
    }
    tail.push(change);
  }
  if (tail.length === 0) return { run: [], automatic: false, reviewed: false };
  return { run: tail.reverse(), automatic: true, reviewed: true };
}

/**
 * THE SAME FACT, FOR A WHOLE QUEUE AT ONCE.
 *
 * The collections list carries a Record payment form behind an icon on every
 * row, and a desk that opens it has to be told the same thing the cargo page
 * tells them: this figure is not what the bill said this morning, and here is
 * the press that puts it back. One query for the page — the alternative is a
 * query per row on a hundred-row queue.
 */
export async function standingPriceChanges(
  invoices: { id: string; paid: boolean }[]
) {
  const out = new Map<string, StandingPriceChange>();
  const ids = invoices.map((i) => i.id);
  if (ids.length === 0) return out;

  const rows = await prisma.invoicePriceChange.findMany({
    where: { invoiceId: { in: ids }, status: { in: ["UNSEEN", "CONFIRMED"] } },
    orderBy: { changedAt: "asc" },
    select: {
      id: true,
      invoiceId: true,
      status: true,
      reason: true,
      changedAt: true,
      changedById: true,
      currency: true,
      totalBefore: true,
      totalAfter: true,
      rateBefore: true,
      methodBefore: true,
      changedBy: { select: { name: true } },
    },
  });

  const byInvoice = new Map<string, typeof rows>();
  for (const row of rows) {
    const list = byInvoice.get(row.invoiceId) ?? [];
    list.push(row);
    byInvoice.set(row.invoiceId, list);
  }

  for (const invoice of invoices) {
    const list = byInvoice.get(invoice.id);
    if (!list || list.length === 0) continue;
    const { run, automatic, reviewed } = standingRun(list, {
      paid: invoice.paid,
    });
    if (run.length === 0) continue;
    const first = run[0];
    const last = run[run.length - 1];
    out.set(invoice.id, {
      changeId: last.id,
      currency: last.currency,
      totalBefore: toNumber(first.totalBefore),
      totalAfter: toNumber(last.totalAfter),
      rateBefore:
        first.rateBefore === null ? null : toNumber(first.rateBefore),
      perItemBefore:
        first.methodBefore === null
          ? null
          : first.methodBefore === "FIXED_PER_ITEM",
      steps: run.length,
      reason: last.reason,
      changedBy: last.changedBy?.name ?? null,
      changedAt: last.changedAt.toISOString(),
      changedById: last.changedById,
      /* Every step of it the rate book's own work — see AUTO_WEIGHT_REASON. */
      automatic,
      reviewed,
    });
  }
  return out;
}

export type StandingPriceChange = {
  changeId: string;
  currency: string;
  totalBefore: number;
  totalAfter: number;
  rateBefore: number | null;
  perItemBefore: boolean | null;
  steps: number;
  reason: string | null;
  changedBy: string | null;
  /** ISO — the queue hands this to a client component. */
  changedAt: string;
  changedById: string | null;
  automatic: boolean;
  reviewed: boolean;
};
