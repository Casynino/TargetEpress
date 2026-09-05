import "server-only";

import { STORAGE_POLICY, storageDaysFor } from "@/lib/constants";
import { batchCreditRevenue } from "@/lib/credit-queries";
import { toNumber } from "@/lib/format";
import { currentRateValue, toLocal } from "@/lib/fx";
import type { Locale } from "@/lib/locale";
import { quote, quoteContext } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { outstandingOf } from "@/lib/invoice-balance";

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
   * How much of this flight left the warehouse unpaid, by agreement.
   *
   * The band already reported billed, collected and outstanding, and could not
   * tell the difference between a customer who has not turned up and a customer
   * Finance agreed to wait for. Those are opposite problems: one is a collection
   * failure, the other is a decision the company made on purpose, and a single
   * outstanding total hid which one a flight had.
   *
   * NEITHER of these is cash. `creditBilledUsd` is revenue billed on terms;
   * `cashBilledUsd` is revenue billed for payment on collection — also not money
   * in hand. `receivedUsd` remains the only figure on this object describing
   * money that has actually arrived. The split is derived by subtraction from
   * `billedUsd`, on the same basis, rather than stored anywhere.
   */
  creditBilledUsd: number;
  cashBilledUsd: number;
  /** Of the credit, what has come back. Already inside `receivedUsd`. */
  creditCollectedUsd: number;
  /** Of `outstandingUsd`, the part sitting on agreed terms rather than unpaid. */
  creditOutstandingUsd: number;
  /** Of that, the part now past its due date. A phone call list. */
  creditOverdueUsd: number;
  creditCount: number;
  creditOverdueCount: number;

  /**
   * What this flight cost to move: customs, port charges, clearing, transport,
   * permits. Operating costs only — a special cost is real money and shows in
   * the cash position, but charging it to a flight would make that flight look
   * unprofitable for a reason that has nothing to do with the flight.
   */
  /** Billed, given up on, and taken back out of revenue when a batch closed. */
  writtenOffUsd: number;
  /**
   * The warehouse clock, per batch.
   *
   * A flight where half the cargo sat for three weeks is a different operation
   * from one that cleared in a day, and until now the batch could not say so:
   * storage was folded inside revenue and the waivers were nowhere at all.
   *
   * Charged is revenue this batch earned from the clock. Waived is what the
   * desk chose not to collect. Holding is how many consignments are still
   * accruing right now, which is the only forward-looking number of the three
   * — it is a phone call list.
   */
  storageChargedUsd: number;
  storageWaivedUsd: number;
  storageHolding: number;
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
          amountAdjusted: true,
          totalLocal: true,
          status: true,
          storageCharge: true,
          storageWaivedUsd: true,
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
  let storageChargedUsd = 0;
  let storageWaivedUsd = 0;
  let storageHolding = 0;
  let weightKg = 0;
  let drafts = 0;
  let draftsUsd = 0;

  const needsEstimate: typeof cargo = [];

  for (const piece of cargo) {
    weightKg += toNumber(piece.weightKg);

    /* Counted off the dates rather than off the invoice, so a consignment
       still accruing shows up here before anybody has charged it. */
    if (
      piece.arrivedAt &&
      !piece.deliveredAt &&
      storageDaysFor(piece.arrivedAt, null) > 0
    ) {
      storageHolding += 1;
    }
    if (piece.invoice && piece.invoice.status !== "VOID") {
      storageChargedUsd += toNumber(piece.invoice.storageCharge);
      storageWaivedUsd += toNumber(piece.invoice.storageWaivedUsd);
    }

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
      /* Per bill, through the helper — a flight whose every bill is settled
         showed a debt on the batch band and in its own profit and loss. */
      outstandingUsd += outstandingOf(piece.invoice);
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

  // The rule book is fetched once and every estimate resolves from memory —
  // a fresh manifest of unpriced lines used to cost two queries per line on
  // every view of this page.
  const pricebook = needsEstimate.length > 0 ? await quoteContext() : null;
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
        locale,
        pricebook!
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
    Who cannot be rung, what the flight cost, and how much of it went out on
    terms. Three independent reads, so one round trip rather than three.

    Costs are already stored in USD on the row, frozen at the rate on the day
    they were recorded, so a shilling cost and a dollar cost can be added
    together without re-converting history every time this page is opened.

    The credit side is asked of lib/credit-queries.ts rather than worked out from
    the invoices already in hand above. Every one of them is sitting in `cargo`
    and it would be four lines to total the APPROVED ones here — which is
    exactly how this app got two answers to "what is still owed" four times
    running, one of them always a week out of date.
  */
  const [unreachable, costs, credit] = await Promise.all([
    prisma.shipment.count({
      where: { batchId, deletedAt: null, customer: { phone: null } },
    }),
    prisma.expense.findMany({
      where: {
        batchId,
        status: { not: "VOID" },
        expenseClass: "OPERATING",
      },
      select: { amountUsd: true, amount: true, currency: true },
    }),
    batchCreditRevenue(batchId),
  ]);
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

  /*
    Cash revenue is what is left of billed revenue once the credit is taken out.

    Derived, not counted a second time. Walking the invoices again here to add up
    the ones whose creditStatus is APPROVED would put a second answer to "how
    much of this flight went out on terms" in the codebase, and it would drift
    from the credit book the first time either side changed its mind about a
    write-off. `batchCreditRevenue` states the basis it uses and matches this
    one, so the two always sum back to `billedUsd`.

    Note what this figure is NOT: money in the till. A cash-terms bill is still a
    bill. `receivedUsd` is the only collected figure on this object, and profit is
    still measured against billed revenue — credit included — because the cargo
    went and the revenue happened.
  */
  const cashBilledUsd = billedUsd - credit.billedUsd;

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
    creditBilledUsd: credit.billedUsd,
    cashBilledUsd,
    creditCollectedUsd: credit.collectedUsd,
    creditOutstandingUsd: credit.outstandingUsd,
    creditOverdueUsd: credit.overdueUsd,
    creditCount: credit.count,
    creditOverdueCount: credit.overdueCount,
    writtenOffUsd,
    storageChargedUsd,
    storageWaivedUsd,
    storageHolding,
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
