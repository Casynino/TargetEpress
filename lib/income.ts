import "server-only";

import { toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { prisma } from "@/lib/prisma";

/**
 * The sheet Finance has always kept, computed from the records instead.
 *
 * Two halves, exactly as they are drawn on paper. GOODS RECEIVED is what
 * landed and what it is worth: the weight, the selling rate, the freight and
 * customs that have to be paid back on it, and the margin left over. GOODS
 * SOLD is what has actually been collected — the weight customers have paid
 * for and the money in the bank against it.
 *
 * The boss reads the gap between the two halves. Everything else on this page
 * exists to make that gap honest.
 *
 * Two figures are entered, not derived: freight per kilo and customs per kilo.
 * They are negotiated per flight — Guangzhou at 8 and Hong Kong at 9.5 on the
 * same week — and nothing in the system can know them. Everything else comes
 * from the invoices and payments already on record, so the sheet cannot drift
 * from the books the way a spreadsheet does.
 */
export type IncomeRow = {
  batchId: string;
  batchNumber: string;
  /** The month it belongs to, YYYY-MM, for the period chips. */
  month: string;
  arrivedLabel: string | null;

  // ---- Goods received -----------------------------------------------------
  /** Everything that landed on this flight. */
  kg: number;
  /** What it is worth, billed where billed and priced from the rate book where
   *  not — the same figure the flight's own page calls expected revenue. */
  worthUsd: number;
  /** Worth ÷ weight. Descriptive: the sheet writes one rate per flight, and a
   *  real flight carries cargo at several. */
  sellRate: number | null;
  /** Entered by Finance. Null until they are. */
  freightRate: number | null;
  customsRate: number | null;
  /** freight + customs, the per-kilo cost of getting it here. */
  landedRate: number | null;
  /** What has to be paid back: weight × landed rate. */
  paybackUsd: number | null;
  /** Selling rate − landed rate: the margin on a kilo. */
  profitRate: number | null;
  /** Worth − payback. */
  profitUsd: number | null;

  // ---- Goods sold ---------------------------------------------------------
  /** Weight whose bill is settled in full. */
  soldKg: number;
  /** What that weight was billed at. */
  soldUsd: number;
  /** Money actually in, including part-payments on cargo not yet settled. This
   *  is why it is reported beside soldUsd rather than instead of it. */
  collectedUsd: number;
};

export type IncomeSheet = {
  rows: IncomeRow[];
  /** USD → TZS. Null when no rate is published; the sheet then shows dollars. */
  rate: number | null;
  months: { key: string; label: string }[];
  totals: {
    kg: number;
    worthUsd: number;
    paybackUsd: number;
    profitUsd: number;
    soldKg: number;
    soldUsd: number;
    collectedUsd: number;
    /*
      Weighted, not summed.

      The paper sheet adds the rate column up — 12.5 + 13.5 + 12.5 = 38.5 — and
      that figure means nothing: it is dollars per kilo added to dollars per
      kilo. What the boss is actually asking is "what did we get per kilo
      across everything", which is the total divided by the total weight. Same
      question, an answer that survives another flight being added.
    */
    sellRate: number | null;
    landedRate: number | null;
    profitRate: number | null;
  };
};

export async function incomeSheet(month?: string): Promise<IncomeSheet> {
  const rate = await currentRateValue();

  const batches = await prisma.batch.findMany({
    where: { permanent: false },
    orderBy: [{ arrivalDate: "desc" }, { departureDate: "desc" }],
    take: 200,
    select: {
      id: true,
      batchNumber: true,
      arrivalDate: true,
      departureDate: true,
      createdAt: true,
      freightRatePerKg: true,
      customsRatePerKg: true,
      shipments: {
        where: { deletedAt: null },
        select: {
          weightKg: true,
          invoice: { select: { status: true, total: true, amountPaid: true } },
        },
      },
    },
  });

  const all: IncomeRow[] = batches.map((batch) => {
    let kg = 0;
    let worthUsd = 0;
    let soldKg = 0;
    let soldUsd = 0;
    let collectedUsd = 0;

    for (const piece of batch.shipments) {
      const weight = toNumber(piece.weightKg);
      kg += weight;

      const invoice = piece.invoice;
      if (!invoice) continue;
      // A withdrawn bill is not worth anything and a written-off one is worth
      // only what came in before it was given up on — the same rule the
      // flight's own figures use, so the two screens cannot disagree.
      if (invoice.status === "VOID") continue;

      const total = toNumber(invoice.total);
      const paid = toNumber(invoice.amountPaid);
      collectedUsd += paid;

      if (invoice.status === "WRITTEN_OFF") {
        worthUsd += paid;
        continue;
      }

      worthUsd += total;

      // Sold means settled. A part-paid consignment is not sold cargo — the
      // customer still owes for it — but the money that did arrive is real and
      // is counted in collected, one line above.
      if (invoice.status === "PAID") {
        soldKg += weight;
        soldUsd += total;
      }
    }

    const freightRate =
      batch.freightRatePerKg === null ? null : toNumber(batch.freightRatePerKg);
    const customsRate =
      batch.customsRatePerKg === null ? null : toNumber(batch.customsRatePerKg);
    const landedRate =
      freightRate === null && customsRate === null
        ? null
        : (freightRate ?? 0) + (customsRate ?? 0);

    const sellRate = kg > 0 ? worthUsd / kg : null;
    const paybackUsd = landedRate === null ? null : kg * landedRate;

    return {
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      month: (batch.arrivalDate ?? batch.departureDate ?? batch.createdAt)
        .toISOString()
        .slice(0, 7),
      arrivedLabel: batch.arrivalDate
        ? batch.arrivalDate.toISOString().slice(0, 10)
        : null,
      kg,
      worthUsd,
      sellRate,
      freightRate,
      customsRate,
      landedRate,
      paybackUsd,
      profitRate:
        sellRate === null || landedRate === null ? null : sellRate - landedRate,
      profitUsd: paybackUsd === null ? null : worthUsd - paybackUsd,
      soldKg,
      soldUsd,
      collectedUsd,
    };
  });

  const months = [...new Set(all.map((row) => row.month))]
    .sort()
    .reverse()
    .map((key) => ({
      key,
      label: new Date(`${key}-02`).toLocaleDateString("en-GB", {
        month: "short",
        year: "numeric",
      }),
    }));

  const rows = month ? all.filter((row) => row.month === month) : all;

  const sum = (pick: (row: IncomeRow) => number | null) =>
    rows.reduce((acc, row) => acc + (pick(row) ?? 0), 0);

  const kg = sum((r) => r.kg);
  const worthUsd = sum((r) => r.worthUsd);
  /* Only flights whose rates have been entered can contribute to a payback
     total, or the average would be dragged down by blanks. */
  const priced = rows.filter((row) => row.landedRate !== null);
  const pricedKg = priced.reduce((acc, row) => acc + row.kg, 0);
  const paybackUsd = priced.reduce((acc, row) => acc + (row.paybackUsd ?? 0), 0);

  return {
    rows,
    rate,
    months,
    totals: {
      kg,
      worthUsd,
      paybackUsd,
      profitUsd: sum((r) => r.profitUsd),
      soldKg: sum((r) => r.soldKg),
      soldUsd: sum((r) => r.soldUsd),
      collectedUsd: sum((r) => r.collectedUsd),
      sellRate: kg > 0 ? worthUsd / kg : null,
      landedRate: pricedKg > 0 ? paybackUsd / pricedKg : null,
      profitRate:
        pricedKg > 0
          ? priced.reduce((acc, row) => acc + (row.profitUsd ?? 0), 0) / pricedKg
          : null,
    },
  };
}
