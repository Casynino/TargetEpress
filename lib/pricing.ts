import "server-only";

import type { CargoCategory, Origin, PricingMethod } from "@prisma/client";

import { routeFor } from "@/lib/cargo";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { othersLast } from "@/lib/cargo-types";
import { prisma } from "@/lib/prisma";

/**
 * Freight pricing.
 *
 * A lookup plus arithmetic, returning every step of the working. Both staff and
 * customers see how a figure was reached — "15 kg at USD 12.50" survives a phone
 * call in a way that "USD 187.50" does not.
 *
 * Nothing about a rate is hardcoded. Rules live in the PricingRule table and are
 * resolved most-specific-first:
 *   1. a rule naming this exact cargo type, in the matching weight tier
 *   2. a rule for the whole category, in the matching weight tier
 * and among equals, the latest effectiveFrom wins. That is what lets the CEO
 * publish a new rate without touching code or invalidating old invoices.
 */

export type QuoteInput = {
  category: CargoCategory;
  cargoTypeId?: string | null;
  /**
   * Total scale weight of the whole consignment, kg — not the weight of one
   * box. This is what `Shipment.weightKg` holds and what the desk writes on
   * the scale ticket, so the engine takes it in the same units the business
   * records it in.
   */
  weightKg: number;
  /**
   * How many pieces. Prices FIXED_PER_ITEM cargo and nothing else — it must
   * never multiply `weightKg`, which is already the total. Doing both is how
   * a 6 kg consignment in 15 cartons was billed as 90 kg.
   */
  quantity?: number;
  /** Price as at this moment; lets an old invoice be re-explained. */
  asOf?: Date;
};

export type QuoteLine = {
  label: string;
  detail?: string;
  amount: number;
};

export type Quote =
  | {
      ok: true;
      currency: string;
      route: Origin;
      method: PricingMethod;
      rate: number;
      quantity: number;
      actualWeightKg: number;
      chargeableWeightKg: number | null;
      /** Why that chargeable weight, in words. */
      basis: string;
      lines: QuoteLine[];
      total: number;
      ruleId: string;
      cargoTypeName: string | null;
      notes: string | null;
    }
  | { ok: false; reason: "no-rule"; message: string; route: Origin };

async function resolveRule(input: QuoteInput) {
  const asOf = input.asOf ?? new Date();

  const candidates = await prisma.pricingRule.findMany({
    where: {
      active: true,
      category: input.category,
      effectiveFrom: { lte: asOf },
      OR: [
        ...(input.cargoTypeId ? [{ cargoTypeId: input.cargoTypeId }] : []),
        { cargoTypeId: null },
      ],
    },
    orderBy: { effectiveFrom: "desc" },
    include: { cargoType: { select: { name: true } } },
  });

  // Total weight is what a tier is judged on: three 4 kg boxes is a 12 kg
  // shipment and earns the over-10 kg rate. `weightKg` is already that total,
  // so it is used as given — multiplying by the carton count counted every
  // kilo once per box.
  const totalWeight = Math.max(0, input.weightKg);

  const inTier = (rule: (typeof candidates)[number]) => {
    const min = rule.minWeightKg === null ? null : toNumber(rule.minWeightKg);
    const max = rule.maxWeightKg === null ? null : toNumber(rule.maxWeightKg);
    if (min !== null && totalWeight < min) return false;
    if (max !== null && totalWeight >= max) return false;
    return true;
  };

  const specific = candidates.filter(
    (r) => input.cargoTypeId && r.cargoTypeId === input.cargoTypeId && inTier(r)
  );
  if (specific.length > 0) return specific[0];

  const categoryWide = candidates.filter((r) => r.cargoTypeId === null && inTier(r));
  return categoryWide[0] ?? null;
}

export async function quote(
  input: QuoteInput,
  locale: Locale = "en"
): Promise<Quote> {
  // A product may name its own airport — an LCD panel is normal goods out of
  // Guangzhou, a laptop is electronics out of Hong Kong. Falls back to the
  // category default when the product does not say.
  const productRoute = input.cargoTypeId
    ? (
        await prisma.cargoType.findUnique({
          where: { id: input.cargoTypeId },
          select: { route: true },
        })
      )?.route ?? null
    : null;
  const route = productRoute ?? routeFor(input.category);
  const quantity = Math.max(1, Math.round(input.quantity ?? 1));
  // The consignment total as weighed. See the note on QuoteInput.weightKg:
  // quantity prices per-item cargo, it does not scale the weight.
  const actualWeightKg = Math.max(0, input.weightKg);

  const rule = await resolveRule(input);

  if (!rule) {
    return {
      ok: false,
      reason: "no-rule",
      route,
      message: t(
        locale,
        "No active rate covers that cargo yet. Ask the CEO to publish one, or message us for a quote."
      ),
    };
  }

  const rate = toNumber(rule.price);
  const lines: QuoteLine[] = [];
  let total: number;
  let chargeableWeightKg: number | null = null;
  let basis: string;

  if (rule.method === "FIXED_PER_ITEM") {
    total = rate * quantity;
    basis = t(locale, "Fixed price per item — weight does not change the charge.");
    lines.push({
      label: rule.cargoType?.name ?? t(locale, "Fixed price"),
      detail: `${quantity} × ${rule.currency} ${rate.toLocaleString()}`,
      amount: total,
    });
  } else {
    // Weight-based. This business bills on scale weight only — no volumetric
    // calculation, by explicit instruction — subject to any minimum on the rule.
    const minKg = rule.minChargeableKg === null ? 0 : toNumber(rule.minChargeableKg);

    chargeableWeightKg = actualWeightKg;
    basis = t(locale, "Priced on the scale weight of your cargo.");

    if (minKg > chargeableWeightKg) {
      chargeableWeightKg = minKg;
      // Composed, not looked up: the figure is inside the sentence, so the
      // number sits between two translated fragments rather than inside a key
      // no dictionary could ever match.
      basis = `${t(locale, "Priced on this route's minimum billable weight of")} ${minKg} ${t(locale, "kg.")}`;
    }

    total = chargeableWeightKg * rate;
    lines.push({
      label: t(locale, "Air freight"),
      detail: `${chargeableWeightKg.toFixed(2)} ${t(locale, "kg")} × ${rule.currency} ${rate.toLocaleString()}/${t(locale, "kg")}`,
      amount: total,
    });
  }

  const minCharge = rule.minCharge === null ? 0 : toNumber(rule.minCharge);
  if (minCharge > total) {
    lines.push({
      label: t(locale, "Minimum charge adjustment"),
      detail: `${t(locale, "This rate has a floor of")} ${rule.currency} ${minCharge.toLocaleString()}`,
      amount: minCharge - total,
    });
    total = minCharge;
  }

  return {
    ok: true,
    currency: rule.currency,
    route,
    method: rule.method,
    rate,
    quantity,
    actualWeightKg,
    chargeableWeightKg,
    basis,
    lines,
    total,
    ruleId: rule.id,
    cargoTypeName: rule.cargoType?.name ?? null,
    notes: rule.notes,
  };
}

/** Cargo types the operator may pick, grouped for a category select. */
export async function cargoTypesByCategory() {
  const types = await prisma.cargoType.findMany({
    where: { active: true },
    orderBy: [{ category: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, category: true },
  });

  const grouped = types.reduce<Record<string, { id: string; name: string }[]>>(
    (byCategory, type) => {
      (byCategory[type.category] ??= []).push({ id: type.id, name: type.name });
      return byCategory;
    },
    {}
  );

  // The catch-all goes last in every group — see lib/cargo-types.ts.
  for (const category of Object.keys(grouped)) {
    grouped[category] = othersLast(grouped[category]);
  }
  return grouped;
}

/** Has the CEO published anything, or is the book still empty? */
export async function hasPublishedRates() {
  return (await prisma.pricingRule.count({ where: { active: true } })) > 0;
}

/** The full rate book, for the pricing admin screen and the public rates page. */
export async function rateBook() {
  return prisma.pricingRule.findMany({
    orderBy: [
      { category: "asc" },
      { cargoTypeId: "asc" },
      { minWeightKg: "asc" },
      { effectiveFrom: "desc" },
    ],
    include: { cargoType: { select: { name: true, category: true } } },
  });
}
