import "server-only";

import type { Prisma } from "@prisma/client";

import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { quote, type QuoteContext } from "@/lib/pricing";

/** A cent. Money comparisons never test decimals for equality. */
const CENT = 0.005;
/** Weights are stored to three places; a gram is the smallest real difference. */
const GRAM = 0.0005;

type Quoted = Extract<Awaited<ReturnType<typeof quote>>, { ok: true }>;

/**
 * Did the route's minimum billable weight inflate this quote, and nothing else?
 *
 * Both halves matter. The first picks out the consignments the pool is for — a
 * box above the minimum is priced on its own weight and must never move. The
 * second is a refusal to touch a quote this file does not fully understand: a
 * rule may also carry a minimum CHARGE, which lifts the total without touching
 * the weight, and a pool built on `chargeable × rate` would quietly drop that
 * floor. Where the arithmetic does not reconcile, the consignment keeps the
 * price the rate book gave it.
 */
export function minimumBit(q: Quoted): boolean {
  if (q.method !== "WEIGHT_BASED" || q.chargeableWeightKg === null) return false;
  if (q.chargeableWeightKg <= q.actualWeightKg + GRAM) return false;
  return Math.abs(q.total - q.chargeableWeightKg * q.rate) <= CENT;
}

export type PoolShare = {
  /** What this consignment's freight should be. Zero for every member but one. */
  freight: number;
  /**
   * What THIS consignment is stamped with — the pool's weight on the carrier,
   * its own weight on the rest. Written onto the shipment so its page and its
   * PDF print a weight that matches the freight beside it.
   *
   * NOT the figure the working table shows. A parcel that carries nothing is
   * stamped with its own 0.3 kg, and printing that as the billable weight told
   * the reader the customer was billed for 0.3 kg at 13.50 — which is neither
   * what happened nor what the total underneath says. See `billableKg`.
   */
  chargeableKg: number;
  /** What the POOL is billed on, the same on every member's page. */
  billableKg: number;
  /** True for the one consignment carrying the whole charge. */
  carries: boolean;
  /** The consignment that carries it, for the line that explains a zero bill. */
  carrierTracking: string;
  /** Every consignment in the pool, this one included. */
  memberTrackings: string[];
  /*
    THE WORKING, SO A BILL OF NOTHING CAN EXPLAIN ITSELF.

    A customer's second parcel shows USD 0.00 and no figure on the page says
    why. The owner asked for the arithmetic on the screen: each parcel and its
    weight, what they come to, what that is billed as, and the rate — so a
    reader can check the total rather than take it on trust.
  */
  members: { trackingNumber: string; weightKg: number }[];
  /** What the parcels actually weigh together. */
  combinedKg: number;
  /** The route's own minimum, for the line that says why 0.9 became 1. */
  minimumKg: number;
  rate: number;
  currency: string;
  /** What the pool comes to in total, on whichever bill carries it. */
  pooledFreight: number;
};

/**
 * THE ROUTE'S MINIMUM BILLABLE WEIGHT, SHARED ONCE PER CUSTOMER PER FLIGHT.
 *
 * Madina lands 0.1 kg and 0.8 kg on one aircraft. The minimum is 1 kg and it
 * was applied to each consignment on its own, so 0.9 kg of cargo billed as 2 kg
 * and she paid the minimum twice. A minimum charged per parcel is not a
 * minimum, it is a per-parcel fee.
 *
 * ONE ANSWER, ASKED BY EVERY DOOR THAT PRICES. Check-in raises the draft and
 * confirmation re-prices it, and the first version of this lived only in
 * check-in — so confirming a bill re-quoted the consignment alone and put the
 * second minimum straight back. Two desks, two figures, and the customer
 * charged twice by whoever pressed Confirm. The rule belongs in one function
 * that both call.
 *
 * MEMBERSHIP IS A PROPERTY OF THE CARGO, NOT OF THE BILL. Which parcels share a
 * minimum cannot depend on whether somebody has confirmed a price yet, or the
 * answer changes under the desk as they work.
 *
 * Returns null when this consignment is not in a pool at all — it is heavier
 * than the minimum, it is priced per item, it is on no flight, or it is the
 * only one of its customer's on that flight. Then the rate book's own figure
 * stands, untouched.
 */
export async function poolShareFor(
  shipmentId: string,
  ctx?: QuoteContext
): Promise<PoolShare | null> {
  const me = await prisma.shipment.findUnique({
    where: { id: shipmentId },
    select: {
      id: true,
      trackingNumber: true,
      customerId: true,
      batchId: true,
      cargoCategory: true,
      cargoTypeId: true,
      weightKg: true,
      packages: true,
      invoice: { select: { status: true, freightCost: true, freightOverride: true } },
    },
  });
  /* No flight, no pool: a minimum is shared across one aircraft's cargo, and a
     consignment that is on none has nothing to share it with. */
  if (!me || me.batchId === null) return null;

  const mine = await quote(
    {
      category: me.cargoCategory,
      cargoTypeId: me.cargoTypeId,
      weightKg: toNumber(me.weightKg),
      quantity: me.packages,
    },
    "en",
    ctx
  );
  if (!mine.ok || !minimumBit(mine)) return null;

  const siblings = await prisma.shipment.findMany({
    where: {
      deletedAt: null,
      customerId: me.customerId,
      batchId: me.batchId,
      NOT: { id: me.id },
    },
    select: {
      id: true,
      trackingNumber: true,
      cargoCategory: true,
      cargoTypeId: true,
      weightKg: true,
      packages: true,
      invoice: {
        select: { status: true, freightCost: true, freightOverride: true },
      },
    },
  });

  type Member = {
    id: string;
    trackingNumber: string;
    q: Quoted;
    /** A bill somebody has already signed off, carrying a real freight. */
    billedAlready: boolean;
  };

  /*
    THE ASKING CONSIGNMENT IS JUDGED BY THE SAME TEST AS ITS SIBLINGS.

    This said `billedAlready: false` for whichever one was asked about, so the
    already-billed rule below could only ever see the OTHERS. Ask about the
    light parcel and the heavy one looked billed; ask about the heavy one and
    the light one did — and the pool named a different carrier depending on who
    was asking. Two screens reading the same flight disagreed about which bill
    carried the charge.
  */
  const billedOf = (inv: {
    status: string;
    freightCost: Prisma.Decimal;
    freightOverride: Prisma.Decimal | null;
  } | null) =>
    inv !== null &&
    inv.status !== "DRAFT" &&
    toNumber(inv.freightOverride ?? inv.freightCost) > CENT;

  const members: Member[] = [
    {
      id: me.id,
      trackingNumber: me.trackingNumber,
      q: mine,
      billedAlready: billedOf(me.invoice),
    },
  ];

  for (const sib of siblings) {
    const q = await quote(
      {
        category: sib.cargoCategory,
        cargoTypeId: sib.cargoTypeId,
        weightKg: toNumber(sib.weightKg),
        quantity: sib.packages,
      },
      "en",
      ctx
    );
    if (!q.ok || !minimumBit(q)) continue;
    /* One rule, so one minimum and one rate. If the rate book has been edited
       between two check-ins the members can disagree; leave them all alone
       rather than pick a winner. */
    if (q.ruleId !== mine.ruleId) continue;
    if (
      Math.abs(q.chargeableWeightKg! - mine.chargeableWeightKg!) > GRAM ||
      Math.abs(q.rate - mine.rate) > CENT
    ) {
      return null;
    }
    members.push({
      id: sib.id,
      trackingNumber: sib.trackingNumber,
      q,
      billedAlready: billedOf(sib.invoice),
    });
  }

  if (members.length < 2) return null;

  const minKg = mine.chargeableWeightKg!;
  const rate = mine.rate;
  const combined = members.reduce((kg, m) => kg + m.q.actualWeightKg, 0);
  const chargeableKg = Math.max(combined, minKg);

  /*
    A MINIMUM SOMEBODY HAS ALREADY BEEN BILLED WINS.

    The heaviest parcel normally carries the charge. But a customer's light
    parcel can be checked in, priced, confirmed and even paid before the heavy
    one lands — and moving the charge onto the late arrival would bill the same
    minimum a second time against a bill nobody may now alter. Where a sibling's
    price is already signed off and carries real freight, that is where the
    minimum lives and everything else on the flight goes to zero.

    Otherwise the heaviest carries it, ties broken on the tracking number rather
    than on whatever the database returned first: check-in is re-runnable by
    design, and a carrier that moved between two runs would shuffle the charge
    between a customer's bills for no reason anybody could see.
  */
  const billed = members
    .filter((m) => m.billedAlready)
    .sort((a, b) => a.trackingNumber.localeCompare(b.trackingNumber));
  const carrier =
    billed[0] ??
    [...members].sort(
      (a, b) =>
        b.q.actualWeightKg - a.q.actualWeightKg ||
        a.trackingNumber.localeCompare(b.trackingNumber)
    )[0];

  const carries = carrier.id === me.id;
  const pooledFreight = Math.round(chargeableKg * rate * 100) / 100;
  return {
    freight: carries ? pooledFreight : 0,
    chargeableKg: carries ? chargeableKg : mine.actualWeightKg,
    billableKg: chargeableKg,
    carries,
    carrierTracking: carrier.trackingNumber,
    memberTrackings: members.map((m) => m.trackingNumber).sort(),
    members: members
      .map((m) => ({
        trackingNumber: m.trackingNumber,
        weightKg: m.q.actualWeightKg,
      }))
      .sort((a, b) => a.trackingNumber.localeCompare(b.trackingNumber)),
    combinedKg: Math.round(combined * 1000) / 1000,
    minimumKg: minKg,
    rate,
    currency: mine.currency,
    pooledFreight,
  };
}
