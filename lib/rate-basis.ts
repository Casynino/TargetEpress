import "server-only";

import type { CargoCategory } from "@prisma/client";

import { toNumber } from "@/lib/format";
import { quote, quoteContext, type QuoteContext } from "@/lib/pricing";

type Numeric = Parameters<typeof toNumber>[0];

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
 * Null where the category has no weight-priced rule. Then there is no honest
 * per-kilo figure, and the switch must refuse rather than invent a minimum.
 */
export async function weightBasisOf(
  shipment: {
    cargoCategory: CargoCategory;
    weightKg: Numeric;
    packages: number;
    /* Where the book already priced this by weight, its own chargeable weight
       IS the answer — it came from this consignment's own rule, which may be a
       goods-type rule with a minimum of its own. Asking the category rule
       instead could answer with a different minimum for the same cargo. */
    quotedMethod?: string | null;
    chargeableKg?: Numeric | null;
  },
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
  shipment: Parameters<typeof weightBasisOf>[0] | null,
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
 * each row's answer filed under whatever key the list already uses.
 */
export async function rateSwitchesFor<K>(
  items: { key: K; shipment: Parameters<typeof weightBasisOf>[0] | null }[]
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
