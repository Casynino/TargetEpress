import "server-only";

import { STORAGE_POLICY, storageDaysFor } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { currentRateValue, toLocal } from "@/lib/fx";
import type { Locale } from "@/lib/locale";
import { quote } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

/**
 * What one dispatch is worth, and how much of it has been collected.
 *
 * This is the band Finance reads before anything else on a batch: is this
 * flight worth what we expected, and how much of it is still outstanding.
 *
 * TWO SOURCES, DELIBERATELY. A consignment that has been invoiced is worth its
 * invoice — the figure Finance confirmed, at the rate frozen onto it. One that
 * has not is priced live from the rate book, so the band reads correctly today
 * on cargo that has landed but has not been billed yet. Without the second
 * half this panel would show near-zero on a batch of 87 pieces with one
 * invoice against it, which is exactly the state a real batch is in for the
 * first days after it lands.
 *
 * The two halves are reported separately as well as summed, because "USD 40k
 * expected, of which 38k is still only an estimate" is a different sentence
 * from "USD 40k invoiced".
 */

export type BatchFinance = {
  /** Every piece of cargo on the dispatch. */
  pieces: number;
  customers: number;
  weightKg: number;

  /** Invoice raised, at any status. */
  invoiced: number;
  /** Cargo with no invoice yet — the rest of `pieces`. */
  uninvoiced: number;
  /** Drafts nobody in Finance has signed off yet, and what they add up to. */
  drafts: number;
  draftsUsd: number;
  /**
   * Confirmed bills only — what a customer has actually been asked for.
   * `invoicedUsd` minus the drafts, and the honest denominator for "how much
   * of what we billed has come in".
   */
  billedUsd: number;
  /** Cargo the rate book cannot price yet, with the reason it gave. */
  unpriceable: { trackingNumber: string; reason: string }[];

  /** Confirmed invoice totals, in invoice currency (USD). */
  invoicedUsd: number;
  /** Rate-book estimate for everything not yet invoiced. */
  estimatedUsd: number;
  /** The two together — the headline "expected revenue". */
  expectedUsd: number;

  /**
   * The same figure in shillings. Invoiced cargo contributes the rate frozen
   * onto its own invoice and is never re-converted; only the estimate is
   * converted, at today's published rate.
   */
  expectedTzs: number | null;
  /** The rate used for the estimated part. Null when none is published. */
  rate: number | null;

  /** Money actually received, in invoice currency. */
  receivedUsd: number;
  /** Billed but not yet paid. Estimates are excluded — nobody owes an estimate. */
  outstandingUsd: number;

  /**
   * What this flight cost to move: customs, port charges, clearing, transport,
   * permits. Operating costs only — a special cost is real money and shows in
   * the cash position, but charging it to a flight would make that flight look
   * unprofitable for a reason that has nothing to do with the flight.
   */
  /** Billed, given up on, and taken back out of revenue when a batch closed. */
  writtenOffUsd: number;
  expensesUsd: number;
  /** How many cost lines are behind that figure. */
  expenseCount: number;
  /**
   * The same costs in shillings, summed the accurate way.
   *
   * NOT expensesUsd × today's rate. A cost paid in shillings is already an
   * exact shilling figure; converting it to dollars and back rounds it twice
   * and lands a few shillings away from what actually left the account. Summed
   * per row, so the panel listing the costs and the tile totalling them cannot
   * print two different numbers under the same word.
   */
  expensesTzs: number | null;
  /**
   * Billed revenue less what the flight cost.
   *
   * Measured against BILLED rather than expected, deliberately. Expected
   * includes a rate-book estimate for cargo nobody has invoiced yet, and a
   * profit figure built on an estimate is a forecast wearing the clothes of an
   * accounting figure. `expectedProfitUsd` is the forecast, named as one.
   */
  netProfitUsd: number;
  /** Net profit as a percentage of billed revenue. Null when nothing is billed. */
  marginPct: number | null;
  /** The same sum against expected revenue — a forecast, and labelled as one. */
  expectedProfitUsd: number;
  /** True when this batch has cost more than it has billed. */
  atALoss: boolean;

  /**
   * Cargo on this batch whose customer has no phone number.
   *
   * A finance figure, not a warehouse one: an outstanding balance you cannot
   * ring anybody about is the hardest kind to collect. The packing-list
   * importer already counted these once and wrote the number into a note, where
   * it went stale the moment somebody added a phone. Counted live instead.
   */
  unreachable: number;
};

export async function batchFinance(
  batchId: string,
  locale: Locale = "en"
): Promise<BatchFinance> {
  const cargo = await prisma.shipment.findMany({
    where: { batchId, deletedAt: null },
    select: {
      trackingNumber: true,
      customerId: true,
      weightKg: true,
      packages: true,
      cargoCategory: true,
      cargoTypeId: true,
      arrivedAt: true,
      deliveredAt: true,
      invoice: {
        select: {
          total: true,
          amountPaid: true,
          totalLocal: true,
          status: true,
        },
      },
    },
  });

  const rate = await currentRateValue();

  let invoicedUsd = 0;
  let receivedUsd = 0;
  let outstandingUsd = 0;
  let invoicedTzs = 0;
  let invoiced = 0;
  let writtenOffUsd = 0;
  let weightKg = 0;
  let drafts = 0;
  let draftsUsd = 0;

  const needsEstimate: typeof cargo = [];

  for (const piece of cargo) {
    weightKg += toNumber(piece.weightKg);

    if (!piece.invoice) {
      needsEstimate.push(piece);
      continue;
    }

    // Drafted counts as generated — the spec asks for one per consignment and
    // an auto-draft is one. What it does NOT count as is billed.
    invoiced += 1;
    const total = toNumber(piece.invoice.total);
    const paid = toNumber(piece.invoice.amountPaid);

    // A voided invoice is not revenue and is not a debt. It stays out of every
    // figure rather than being counted and then subtracted.
    if (piece.invoice.status === "VOID") continue;

    /*
      A written-off bill is money the company decided it will never see.

      Same arithmetic as a void — out of revenue, out of debt — for a different
      reason, and the difference matters enough to keep its own total. A void
      was a bill that should not have existed; a write-off was a real debt
      somebody gave up on, and a flight that closed by giving up on a fifth of
      its revenue should not look identical to one that collected everything.
    */
    if (piece.invoice.status === "WRITTEN_OFF") {
      writtenOffUsd += total - paid;
      // What was actually collected before it was given up on is still money
      // in the bank and still this flight's revenue.
      invoicedUsd += paid;
      receivedUsd += paid;
      continue;
    }

    invoicedUsd += total;
    receivedUsd += paid;
    // Only a confirmed bill is a debt. A draft is the system's own figure and
    // the customer has never seen it, so it counts towards what this flight is
    // worth and towards nothing anybody owes.
    if (piece.invoice.status !== "DRAFT") {
      outstandingUsd += Math.max(0, total - paid);
    } else {
      drafts += 1;
      draftsUsd += total;
    }
    // The rate frozen at issue, not today's. An invoice is a promise in
    // shillings and does not move when the rate does.
    invoicedTzs +=
      piece.invoice.totalLocal === null
        ? rate === null
          ? 0
          : toLocal(total, rate)
        : toNumber(piece.invoice.totalLocal);
  }

  // Priced in parallel: the rate book is a handful of rows and every lookup is
  // independent, so this is one round of concurrent reads rather than a walk.
  const estimates = await Promise.all(
    needsEstimate.map(async (piece) => {
      // The reason a piece cannot be priced is read by Finance on the batch
      // band, so it is asked for in the reader's language.
      const priced = await quote(
        {
          category: piece.cargoCategory,
          cargoTypeId: piece.cargoTypeId,
          weightKg: toNumber(piece.weightKg),
          quantity: piece.packages,
        },
        locale
      );
      if (!priced.ok) {
        return {
          trackingNumber: piece.trackingNumber,
          reason: priced.message,
          amount: 0,
        };
      }
      // Storage is part of what the customer will owe, and it is already
      // running on cargo that landed a week ago.
      const storage =
        storageDaysFor(piece.arrivedAt, piece.deliveredAt) *
        STORAGE_POLICY.perDayUsd;
      return {
        trackingNumber: piece.trackingNumber,
        reason: null,
        amount: priced.total + storage,
      };
    })
  );

  const estimatedUsd = estimates.reduce((sum, e) => sum + e.amount, 0);
  const unpriceable = estimates
    .filter((e) => e.reason !== null)
    .map((e) => ({ trackingNumber: e.trackingNumber, reason: e.reason! }));

  const expectedUsd = invoicedUsd + estimatedUsd;
  const expectedTzs =
    rate === null ? null : invoicedTzs + toLocal(estimatedUsd, rate);

  /*
    What the flight cost.

    Already stored in USD on the row, frozen at the rate on the day it was
    recorded, so a shilling cost and a dollar cost can be added together
    without re-converting history every time this page is opened.
  */
  const unreachable = await prisma.shipment.count({
    where: { batchId, deletedAt: null, customer: { phone: null } },
  });

  const costs = await prisma.expense.findMany({
    where: {
      batchId,
      status: { not: "VOID" },
      expenseClass: "OPERATING",
    },
    select: { amountUsd: true, amount: true, currency: true },
  });
  const expensesUsd = costs.reduce((sum, c) => sum + toNumber(c.amountUsd), 0);
  const expensesTzs =
    rate === null
      ? null
      : costs.reduce(
          (sum, c) =>
            sum +
            (c.currency === "TZS"
              ? toNumber(c.amount)
              : toNumber(c.amountUsd) * rate),
          0
        );
  const billedUsd = invoicedUsd - draftsUsd;
  const netProfitUsd = billedUsd - expensesUsd;

  return {
    pieces: cargo.length,
    customers: new Set(cargo.map((c) => c.customerId)).size,
    weightKg,
    invoiced,
    uninvoiced: cargo.length - invoiced,
    drafts,
    draftsUsd,
    unpriceable,
    invoicedUsd,
    billedUsd,
    estimatedUsd,
    expectedUsd,
    expectedTzs,
    rate,
    receivedUsd,
    outstandingUsd,
    writtenOffUsd,
    expensesUsd,
    expenseCount: costs.length,
    expensesTzs,
    netProfitUsd,
    marginPct: billedUsd > 0 ? (netProfitUsd / billedUsd) * 100 : null,
    expectedProfitUsd: expectedUsd - expensesUsd,
    atALoss: netProfitUsd < 0,
    unreachable,
  };
}
