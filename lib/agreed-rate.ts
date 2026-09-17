import type { Prisma } from "@prisma/client";

import { toNumber } from "@/lib/format";

/**
 * WHAT THIS CARGO WAS PRICED AT, AND WHAT THE BOOK SAYS IT SHOULD HAVE BEEN.
 *
 * A large customer is given USD 11.50/kg where the rate book says 12.50. That
 * fact belongs to one consignment and has to be stated identically on the
 * cargo, the bill, the payment, the verification, the register and every
 * report — and the owner's rule is that no screen may print the agreed figure
 * alone, because a bill reading 11.50 with nothing beside it says the cargo was
 * always priced at 11.50.
 *
 * Twenty-odd screens ask this question. Working it out at each of them is how
 * two of them come to disagree, so it is worked out HERE and nowhere else.
 *
 * THE FIGURE IS READ, NEVER DERIVED. Dividing the freight total by the weight
 * looks like it would give the same answer and does not: a desk can type a
 * freight TOTAL with no rate behind it, per-item cargo divides by pieces rather
 * than kilos, and a bill carrying storage or a discount divides into nonsense.
 * The rate that was agreed is the one that was stored.
 */
export type RateFacts = {
  /** The rate book's own rate for this cargo. Null where none was recorded. */
  standardRate: number | null;
  /** What Finance agreed for this consignment. Null on the ordinary case. */
  agreedRate: number | null;
  /** Why they agreed it, when the desk said. */
  agreedRateReason: string | null;
  /** Per-piece cargo is priced per item, not per kilo — in the unit the bill
      is charged in now, which the desk may have moved off the book's. */
  ratePerItem: boolean;
  /** The rate book's own unit, which `standardRate` is quoted in. */
  bookPerItem: boolean;
  /**
   * The desk charged this cargo in the other unit — per kilo where the book
   * says per piece, or the reverse. Every screen that prints the rate says so,
   * because 13.50 a kilo beside a book rate of 40.00 a piece otherwise reads as
   * a USD 26.50 discount on the same thing.
   */
  unitSwitched: boolean;
  /**
   * What the agreed rate was multiplied by, as stored beside it — null on the
   * ordinary case and on rates agreed before the quantity was kept. The
   * dialogs keep it while the rate and unit are left alone, exactly as the
   * server does.
   */
  agreedQuantity: number | null;
  /** The rate book's own freight on this bill, where the caller read it. */
  bookFreight: number | null;
  /**
   * What the rate is multiplied by: the piece count for per-item cargo, and
   * otherwise the chargeable weight — what the freight was actually billed on,
   * with the 1 kg minimum already applied, so a 0.4 kg parcel agreed at 11.50
   * bills 11.50 rather than 4.60.
   *
   * Zero where the cargo has not been weighed yet, which is the signal to the
   * controls that there is nothing here to price.
   */
  ratePricedOn: number;
};

type Numeric = Prisma.Decimal | number | string | null | undefined;

export function rateFactsOf(
  invoice: {
    freightRateOverride: Numeric;
    freightOverrideReason?: string | null;
    /** The unit the agreed rate is in, when the desk changed it. */
    freightRateMethod?: string | null;
    /** What the agreed rate was multiplied by, as stored beside it. */
    freightRateQuantity?: Numeric;
    /** The rate book's own freight figure for this bill. */
    freightCost?: Numeric;
  } | null,
  shipment: {
    quotedRate: Numeric;
    quotedMethod: string | null;
    chargeableKg: Numeric;
    weightKg: Numeric;
    packages: number;
  } | null
): RateFacts {
  /*
    THE UNIT THE BILL IS ACTUALLY CHARGED IN.

    The rate book decides it by goods type — Documents are USD 40 a piece
    whatever they weigh — and the corridor sells both. Where a desk has agreed
    a different unit for ONE consignment, that is the unit every screen has to
    read, or the bill prints a rate per kilo beside a figure worked out per
    piece.

    Derived HERE and nowhere else, which is the whole point of this file: some
    twenty screens ask what this cargo is priced at, and two of them working it
    out separately is how they come to disagree.
  */
  /* Only with a rate beside it. Every door clears the two together, but a
     unit with no agreed rate is a claim about nothing, and reading it would
     print a book-priced bill in a unit it was never charged in. */
  const method =
    (invoice?.freightRateOverride != null ? invoice.freightRateMethod : null) ??
    shipment?.quotedMethod ??
    null;
  const perItem = method === "FIXED_PER_ITEM";
  return {
    standardRate:
      shipment?.quotedRate == null ? null : toNumber(shipment.quotedRate),
    agreedRate:
      invoice?.freightRateOverride == null
        ? null
        : toNumber(invoice.freightRateOverride),
    agreedRateReason: invoice?.freightOverrideReason ?? null,
    ratePerItem: perItem,
    bookPerItem: shipment?.quotedMethod === "FIXED_PER_ITEM",
    agreedQuantity:
      invoice?.freightRateOverride != null && invoice.freightRateQuantity != null
        ? toNumber(invoice.freightRateQuantity)
        : null,
    bookFreight:
      invoice?.freightCost == null ? null : toNumber(invoice.freightCost),
    unitSwitched:
      !!shipment &&
      invoice?.freightRateOverride != null &&
      invoice.freightRateMethod != null &&
      perItem !== (shipment.quotedMethod === "FIXED_PER_ITEM"),
    /*
      The stored quantity first, where the rate was agreed with one: it is the
      figure the freight was actually multiplied by. Worked out again here, two
      documents switched to a per-kilo rate printed their 0.4 kg scale weight
      beside a freight charged on the 1 kg minimum.
    */
    ratePricedOn: !shipment
      ? 0
      : invoice?.freightRateOverride != null &&
          toNumber(invoice.freightRateQuantity ?? 0) > 0
        ? toNumber(invoice.freightRateQuantity)
        : perItem
        ? shipment.packages
        : /* `||` rather than `??`: a chargeable weight of zero is no more usable
             than a missing one, and the server's own arithmetic falls back the
             same way. Two spellings of this rule is how the preview on the
             screen and the figure that is stored come to disagree. */
          toNumber(shipment.chargeableKg) || toNumber(shipment.weightKg),
  };
}
