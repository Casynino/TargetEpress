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
  /** Per-piece cargo is priced per item, not per kilo. */
  ratePerItem: boolean;
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
  } | null,
  shipment: {
    quotedRate: Numeric;
    quotedMethod: string | null;
    chargeableKg: Numeric;
    weightKg: Numeric;
    packages: number;
  } | null
): RateFacts {
  const perItem = shipment?.quotedMethod === "FIXED_PER_ITEM";
  return {
    standardRate:
      shipment?.quotedRate == null ? null : toNumber(shipment.quotedRate),
    agreedRate:
      invoice?.freightRateOverride == null
        ? null
        : toNumber(invoice.freightRateOverride),
    agreedRateReason: invoice?.freightOverrideReason ?? null,
    ratePerItem: perItem,
    ratePricedOn: !shipment
      ? 0
      : perItem
        ? shipment.packages
        : /* `||` rather than `??`: a chargeable weight of zero is no more usable
             than a missing one, and the server's own arithmetic falls back the
             same way. Two spellings of this rule is how the preview on the
             screen and the figure that is stored come to disagree. */
          toNumber(shipment.chargeableKg) || toNumber(shipment.weightKg),
  };
}
