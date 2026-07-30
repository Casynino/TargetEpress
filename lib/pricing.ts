import "server-only";

import type { GoodsType, Origin, ShippingMethod } from "@prisma/client";

import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";

/**
 * Freight pricing.
 *
 * Deliberately a lookup plus arithmetic, with every input and every step
 * returned in the result. The public calculator shows the customer the working,
 * not just a number — "191 kg chargeable at TZS 13,000" survives a phone call
 * in a way that "TZS 2,483,000" does not.
 *
 * Everything expandable lives in the RateCard table: add a row for a new goods
 * type, origin or service and the calculator picks it up with no code change.
 */

export type QuoteInput = {
  origin: Origin;
  goodsType: GoodsType;
  method: ShippingMethod;
  /** Actual scale weight, kg. */
  weightKg: number;
  /** Optional volume, CBM — drives volumetric weight for bulky cargo. */
  volumeCbm?: number | null;
  /** Number of identical pieces; multiplies weight and volume. */
  quantity?: number;
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
      actualWeightKg: number;
      volumetricWeightKg: number | null;
      chargeableWeightKg: number;
      /** Which of the two weights the price is actually based on. */
      basis: "actual" | "volumetric" | "minimum";
      pricePerKg: number;
      lines: QuoteLine[];
      total: number;
      transitDays: number | null;
      isPlaceholder: boolean;
      notes: string | null;
    }
  | { ok: false; reason: "no-rate"; message: string };

/**
 * Finds the most specific active rate: an exact goods-type match beats the
 * origin-and-method fallback.
 */
async function findRate(input: QuoteInput) {
  const rates = await prisma.rateCard.findMany({
    where: {
      active: true,
      origin: input.origin,
      method: input.method,
      OR: [{ goodsType: input.goodsType }, { goodsType: null }],
    },
  });

  return (
    rates.find((rate) => rate.goodsType === input.goodsType) ??
    rates.find((rate) => rate.goodsType === null) ??
    null
  );
}

export async function quote(input: QuoteInput): Promise<Quote> {
  const quantity = Math.max(1, input.quantity ?? 1);
  const actualWeightKg = Math.max(0, input.weightKg) * quantity;
  const volumeCbm = input.volumeCbm ? Math.max(0, input.volumeCbm) * quantity : 0;

  const rate = await findRate(input);

  if (!rate) {
    return {
      ok: false,
      reason: "no-rate",
      message:
        "We have not published a rate for that combination yet. Message us on WhatsApp and we will quote it for you.",
    };
  }

  const perKg = toNumber(rate.pricePerKg);
  const minimumKg = toNumber(rate.minimumKg);
  const minimumCharge = toNumber(rate.minimumCharge);

  // Air freight bills whichever is greater: what it weighs, or what the space
  // it occupies would weigh.
  const volumetricWeightKg = volumeCbm > 0 ? volumeCbm * rate.volumetricDivisor : null;

  let chargeableWeightKg = actualWeightKg;
  let basis: "actual" | "volumetric" | "minimum" = "actual";

  if (volumetricWeightKg !== null && volumetricWeightKg > chargeableWeightKg) {
    chargeableWeightKg = volumetricWeightKg;
    basis = "volumetric";
  }
  if (minimumKg > chargeableWeightKg) {
    chargeableWeightKg = minimumKg;
    basis = "minimum";
  }

  const freight = chargeableWeightKg * perKg;
  const lines: QuoteLine[] = [
    {
      label: "Air freight",
      detail: `${chargeableWeightKg.toFixed(2)} kg × ${rate.currency} ${perKg.toLocaleString()}/kg`,
      amount: freight,
    },
  ];

  let total = freight;

  if (minimumCharge > total) {
    lines.push({
      label: "Minimum charge adjustment",
      detail: `This route has a floor of ${rate.currency} ${minimumCharge.toLocaleString()}`,
      amount: minimumCharge - total,
    });
    total = minimumCharge;
  }

  return {
    ok: true,
    currency: rate.currency,
    actualWeightKg,
    volumetricWeightKg,
    chargeableWeightKg,
    basis,
    pricePerKg: perKg,
    lines,
    total,
    transitDays: rate.transitDays,
    isPlaceholder: rate.isPlaceholder,
    notes: rate.notes,
  };
}

/** Whether any real (non-placeholder) rate has been published yet. */
export async function hasPublishedRates() {
  const count = await prisma.rateCard.count({
    where: { active: true, isPlaceholder: false },
  });
  return count > 0;
}

export async function availableMethods() {
  const rows = await prisma.rateCard.findMany({
    where: { active: true },
    select: { method: true },
    distinct: ["method"],
  });
  return rows.map((r) => r.method);
}
