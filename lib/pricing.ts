import "server-only";

import type { CargoCategory, Origin, PricingMethod } from "@prisma/client";

import { routeFor } from "@/lib/cargo";
import { toNumber } from "@/lib/format";
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
  /** Scale weight of one piece, kg. */
  weightKg: number;
  /** Pieces. Multiplies weight for weight-based, and the unit price for fixed. */
  quantity?: number;
  volumeCbm?: number | null;
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

/** Volumetric divisor for air freight — the IATA standard. */
const VOLUMETRIC_KG_PER_CBM = 167;

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
  // shipment and earns the over-10 kg rate.
  const totalWeight = Math.max(0, input.weightKg) * Math.max(1, input.quantity ?? 1);

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

export async function quote(input: QuoteInput): Promise<Quote> {
  const route = routeFor(input.category);
  const quantity = Math.max(1, Math.round(input.quantity ?? 1));
  const actualWeightKg = Math.max(0, input.weightKg) * quantity;

  const rule = await resolveRule(input);

  if (!rule) {
    return {
      ok: false,
      reason: "no-rule",
      route,
      message:
        "No active rate covers that cargo yet. Ask the CEO to publish one, or message us for a quote.",
    };
  }

  const rate = toNumber(rule.price);
  const lines: QuoteLine[] = [];
  let total: number;
  let chargeableWeightKg: number | null = null;
  let basis: string;

  if (rule.method === "FIXED_PER_ITEM") {
    total = rate * quantity;
    basis = `Fixed price per item — weight does not change the charge.`;
    lines.push({
      label: rule.cargoType?.name ?? "Fixed price",
      detail: `${quantity} × ${rule.currency} ${rate.toLocaleString()}`,
      amount: total,
    });
  } else {
    // Weight-based: bill the greater of scale weight, volumetric weight and any
    // minimum billable weight on the rule.
    const volumetric =
      input.volumeCbm && input.volumeCbm > 0
        ? input.volumeCbm * quantity * VOLUMETRIC_KG_PER_CBM
        : null;
    const minKg = rule.minChargeableKg === null ? 0 : toNumber(rule.minChargeableKg);

    chargeableWeightKg = actualWeightKg;
    basis = "Priced on the scale weight of your cargo.";

    if (volumetric !== null && volumetric > chargeableWeightKg) {
      chargeableWeightKg = volumetric;
      basis =
        "Priced on volumetric weight — the cargo is bulky for its weight, so the space it occupies costs more than the kilos.";
    }
    if (minKg > chargeableWeightKg) {
      chargeableWeightKg = minKg;
      basis = `Priced on this route's minimum billable weight of ${minKg} kg.`;
    }

    total = chargeableWeightKg * rate;
    lines.push({
      label: "Air freight",
      detail: `${chargeableWeightKg.toFixed(2)} kg × ${rule.currency} ${rate.toLocaleString()}/kg`,
      amount: total,
    });
  }

  const minCharge = rule.minCharge === null ? 0 : toNumber(rule.minCharge);
  if (minCharge > total) {
    lines.push({
      label: "Minimum charge adjustment",
      detail: `This rate has a floor of ${rule.currency} ${minCharge.toLocaleString()}`,
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

  return types.reduce<Record<string, { id: string; name: string }[]>>(
    (grouped, type) => {
      (grouped[type.category] ??= []).push({ id: type.id, name: type.name });
      return grouped;
    },
    {}
  );
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
