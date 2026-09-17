import "server-only";

import type { CargoCategory } from "@prisma/client";

import { toNumber } from "@/lib/format";
import { quote, quoteContext, type QuoteContext } from "@/lib/pricing";

type Numeric = Parameters<typeof toNumber>[0];

type BasisShipment = {
  cargoCategory: CargoCategory;
  weightKg: Numeric;
  packages: number;
  /* Where the book already priced this by weight, its own chargeable weight
     IS the answer — it came from this consignment's own rule, which may be a
     goods-type rule with a minimum of its own. Asking the category rule
     instead could answer with a different minimum for the same cargo. */
  quotedMethod?: string | null;
  chargeableKg?: Numeric | null;
};

/**
 * WHAT THIS CARGO WOULD BE BILLED ON, IF IT WERE SOLD BY THE KILO.
 *
 * The rate book prices some goods per piece — Documents are USD 40 each
 * whatever they weigh — and the corridor sells them by the kilo too when that
 * is what was agreed. A consignment the book priced per piece carries no
 * per-kilo chargeable weight at all: nothing was ever worked out on its weight.
 *
 * So switching two documents weighing 0.4 kg to "per kg" multiplied the rate by
 * 0.4 and billed 5.40, walking straight past the route's own minimum. The
 * minimum is not a number this file knows — it lives on the rule, and it can
 * differ by category and by weight tier — so the answer is asked of the rate
 * book: the category's own weight-priced rule, with the goods type left out so
 * the per-piece rule cannot answer instead.
 *
 * THIS CONSIGNMENT'S OWN ANSWER, NOT ITS SHARE OF A POOL. Worked out from the
 * pool, the quantity stored on one bill depended on the customer's other bills
 * on the flight — and when one of those was undone or moved, nothing went back
 * to the bills that had assumed it, and a parcel stayed at nothing with its
 * kilos billed nowhere. A per-kilo rate agreed on a light parcel therefore
 * carries that parcel's own minimum; charging a customer's switched parcels
 * the minimum once is a figure a person sets on the bills.
 *
 * Null where the category has no weight-priced rule. Then there is no honest
 * per-kilo figure, and the switch must refuse rather than invent a minimum.
 */
export async function weightBasisOf(
  shipment: BasisShipment,
  ctx?: QuoteContext
): Promise<number | null> {
  if (shipment.quotedMethod === "WEIGHT_BASED") {
    const own = toNumber(shipment.chargeableKg ?? 0) || toNumber(shipment.weightKg);
    if (own > 0) return own;
  }
  const q = await quote(
    {
      category: shipment.cargoCategory,
      /* Left out on purpose: with a goods type, a per-piece rule for that type
         wins, which is the very answer this is asking around. */
      cargoTypeId: null,
      weightKg: toNumber(shipment.weightKg),
      quantity: shipment.packages,
    },
    "en",
    ctx
  );
  if (!q.ok || q.method !== "WEIGHT_BASED" || q.chargeableWeightKg === null) {
    return null;
  }
  return q.chargeableWeightKg;
}

/**
 * BOTH QUANTITIES THE RATE DIALOGS NEED TO OFFER THE SWITCH.
 *
 * The dialog moves between per kilo and per piece without a round trip, so it
 * is handed both answers up front: the piece count, and the per-kilo figure the
 * server itself will multiply by. `rateWeightKg` is undefined where the rate
 * book has no per-kilo rule for this cargo — the dialog then does not offer the
 * switch, rather than offering one the server would refuse.
 */
export async function rateSwitchOf(
  shipment: BasisShipment | null,
  ctx?: QuoteContext
): Promise<{ rateWeightKg?: number; ratePieces?: number }> {
  if (!shipment) return {};
  const basis = await weightBasisOf(shipment, ctx);
  return {
    rateWeightKg: basis === null ? undefined : basis,
    ratePieces: shipment.packages,
  };
}

/**
 * The same, for a whole list at once — the rate book read a single time, and
 * each row's answer filed under whatever key the list already uses. No query
 * per row: the answer is the rate book's arithmetic on figures already loaded.
 */
export async function rateSwitchesFor<K>(
  items: { key: K; shipment: BasisShipment | null }[]
): Promise<Map<K, { rateWeightKg?: number; ratePieces?: number }>> {
  if (items.length === 0) return new Map();
  const ctx = await quoteContext();
  return new Map(
    await Promise.all(
      items.map(
        async ({ key, shipment }) => [key, await rateSwitchOf(shipment, ctx)] as const
      )
    )
  );
}

/* The quantity a stored freight was worked out on, where the rate reproduces
   it exactly — how a bill agreed before quantities were kept says what its
   rate was multiplied by. Null where it cannot be read back honestly. */
function quantityFromFreight(freight: Numeric | null, rate: number): number | null {
  if (freight === null || rate <= 0) return null;
  const f = toNumber(freight);
  const q = Math.round((f / rate) * 1000) / 1000;
  return Math.abs(Math.round(rate * q * 100) / 100 - f) <= 0.005 ? q : null;
}

/**
 * WHAT AN AGREED RATE IS MULTIPLIED BY, ON THE SERVER, FOR EVERY DOOR.
 *
 * Both doors that set a rate — the bill editor and the rate dialog — and the
 * restore that puts a change back all come through here, so the three cannot
 * disagree about the quantity.
 *
 * THE QUANTITY ALREADY ON THE BILL STANDS while the rate and its unit do. It
 * was worked out the day the rate was agreed; working it out again on every
 * save followed today's weight and today's rate book, so a discount typed
 * weeks later on a re-weighed consignment quietly moved its freight from
 * 13.50 to 35.10. Only a different rate or a different unit is a new
 * agreement, and a new agreement is priced on the cargo as it stands now. A
 * rate agreed before quantities were kept stands on the quantity its own
 * freight was worked out on.
 *
 * A RESTORED QUANTITY is taken only where it reproduces the freight sent
 * beside it. Putting a change back sends the figures the bill carried, and
 * nothing is accepted that the freight alone would not already have allowed.
 */
export async function agreedQuantityOf(input: {
  shipment: BasisShipment;
  invoice: {
    freightOverride: Numeric | null;
    freightRateOverride: Numeric | null;
    freightRateMethod: string | null;
    freightRateQuantity: Numeric | null;
  };
  rate: number;
  byItem: boolean;
  restored?: { quantity: number; freight: number | null } | null;
  ctx?: QuoteContext;
}): Promise<number> {
  const { shipment, invoice, rate, byItem, restored } = input;

  if (
    restored &&
    restored.freight !== null &&
    restored.quantity >= 0 &&
    Math.abs(Math.round(rate * restored.quantity * 100) / 100 - restored.freight) <= 0.005
  ) {
    return restored.quantity;
  }

  const sameAgreement =
    invoice.freightRateOverride !== null &&
    Math.abs(toNumber(invoice.freightRateOverride) - rate) < 0.005 &&
    ((invoice.freightRateMethod ?? shipment.quotedMethod) === "FIXED_PER_ITEM") === byItem;
  if (sameAgreement) {
    if (invoice.freightRateQuantity !== null) {
      return toNumber(invoice.freightRateQuantity);
    }
    const standing = quantityFromFreight(invoice.freightOverride, rate);
    if (standing !== null) return standing;
  }

  if (byItem) {
    if (shipment.packages <= 0) {
      throw new Error(
        "This consignment has no confirmed piece count yet, so a rate cannot be turned into a freight figure. Check it in against the manifest first."
      );
    }
    return shipment.packages;
  }

  if (toNumber(shipment.weightKg) <= 0) {
    throw new Error(
      "This consignment has no confirmed weight yet, so a rate cannot be turned into a freight figure. Check it in against the manifest first."
    );
  }
  const kg = await weightBasisOf(shipment, input.ctx);
  if (kg === null || kg <= 0) {
    throw new Error(
      "There is no per-kilo rate for this kind of cargo in the rate book, so it cannot be priced by weight. Add one in Price configuration first."
    );
  }
  return kg;
}

/**
 * The unit and quantity a bill's agreed rate stood in before a change, for the
 * row that records the change. A rate agreed before units were stored was in
 * the book's unit, on the quantity its own freight was worked out on — so that
 * is what is written, and putting it back cannot land in whatever unit the
 * change switched the bill to.
 */
export function agreementBefore(
  invoice: {
    freightOverride: Numeric | null;
    freightRateOverride: Numeric | null;
    freightRateMethod: "WEIGHT_BASED" | "FIXED_PER_ITEM" | null;
    freightRateQuantity: Numeric | null;
  },
  shipment: { quotedMethod: string | null; packages: number; chargeableKg: Numeric | null; weightKg: Numeric }
): { methodBefore: "WEIGHT_BASED" | "FIXED_PER_ITEM" | null; quantityBefore: number | null } {
  if (invoice.freightRateOverride === null) {
    return { methodBefore: null, quantityBefore: null };
  }
  const method =
    invoice.freightRateMethod ??
    (shipment.quotedMethod === "FIXED_PER_ITEM" ? "FIXED_PER_ITEM" : "WEIGHT_BASED");
  const quantity =
    invoice.freightRateQuantity !== null
      ? toNumber(invoice.freightRateQuantity)
      : (quantityFromFreight(invoice.freightOverride, toNumber(invoice.freightRateOverride)) ??
        (method === "FIXED_PER_ITEM"
          ? shipment.packages
          : toNumber(shipment.chargeableKg ?? 0) || toNumber(shipment.weightKg)));
  return { methodBefore: method, quantityBefore: quantity };
}
