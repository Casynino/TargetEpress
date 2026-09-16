import "server-only";

import { Prisma } from "@prisma/client";

import { STORAGE_POLICY, storageDaysFor } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { LOCAL_CURRENCY, currentRateValue, toLocal } from "@/lib/fx";
import { reserveInvoiceNumbers } from "@/lib/ids";
import { quote, quoteContext } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";

/** The invoice columns check-in writes, whether it creates or re-prices. */
type Figures = {
  currency: string;
  freightCost: Prisma.Decimal;
  storageDays: number;
  storageCharge: Prisma.Decimal;
  /* Cleared, never carried — see the note where these are built. */
  freightOverride: null;
  freightRateOverride: null;
  freightOverrideReason: null;
  total: Prisma.Decimal;
  exchangeRate: Prisma.Decimal | null;
  localCurrency: string;
  totalLocal: Prisma.Decimal | null;
  status: "DRAFT";
};

/** A successful quote — the shape `quote()` returns when it can price. */
type Quoted = Extract<Awaited<ReturnType<typeof quote>>, { ok: true }>;

/**
 * Price cargo the moment it is checked in at Dar, as a DRAFT invoice.
 *
 * The owner's rule: nobody works a shipping charge out by hand. The rate book
 * already knows what the cargo costs, so the system does the arithmetic at the
 * moment the cargo becomes real, and Finance reviews rather than types.
 *
 * FOUR THINGS THIS DELIBERATELY DOES NOT DO.
 *
 * 1. It does not run inside the check-in transaction. `quote()` uses the module
 *    client and cannot join one, and a bulk check-in of an 87-line manifest
 *    would otherwise carry ~170 extra queries inside a single transaction
 *    holding row locks on the whole batch.
 *
 * 2. It never fails a check-in. `quote()` returns a soft failure when no rate
 *    covers the cargo; that is written to `pricingBlockedReason` and the cargo
 *    is checked in regardless. Cargo physically standing in the warehouse must
 *    never be un-receivable because the CEO has not published a rate — the box
 *    is here either way, and the clerk cannot fix a rate book.
 *
 * 3. It never touches an invoice that is not still a draft. Check-in is
 *    re-runnable by design, and a re-run must not overwrite a price Finance has
 *    confirmed or a bill a customer has already paid.
 *
 * 4. It does not decide storage. A draft raised on arrival always carries zero
 *    storage days, correctly — none have passed. Storage is worked out again
 *    when Finance confirms the price, which is the whole reason confirming
 *    re-derives instead of flipping a status.
 */

export type AutoPriceResult = {
  priced: number;
  skipped: number;
  blocked: { trackingNumber: string; reason: string }[];
};

export async function autoPriceShipments(
  shipmentIds: string[],
  actorId: string
): Promise<AutoPriceResult> {
  if (shipmentIds.length === 0) {
    return { priced: 0, skipped: 0, blocked: [] };
  }

  const cargo = await prisma.shipment.findMany({
    where: { id: { in: shipmentIds }, deletedAt: null },
    select: {
      id: true,
      trackingNumber: true,
      customerId: true,
      cargoCategory: true,
      cargoTypeId: true,
      weightKg: true,
      packages: true,
      batchId: true,
      arrivedAt: true,
      deliveredAt: true,
      invoice: { select: { id: true, status: true, storageWaivedUsd: true } },
    },
  });

  // One rate for the whole run, so eighty-seven drafts raised by one press of
  // one button cannot be denominated at two different rates. The rule book is
  // taken once for the same reason — and because re-reading the same small
  // table per line priced a manifest in hundreds of round trips.
  const [rate, pricebook] = await Promise.all([currentRateValue(), quoteContext()]);

  const blocked: AutoPriceResult["blocked"] = [];
  let skipped = 0;

  /*
    EVERY QUOTE FIRST, THEN THE WRITES.

    This used to open one interactive transaction per consignment — BEGIN,
    write, write, COMMIT, four round trips a line — so an eighty-seven box
    manifest cost the warehouse several hundred waits before the screen came
    back, and the wait grew with the flight.

    The reason it was per consignment was that a rate book gap on line forty
    must not roll back the thirty-nine drafts before it. Quoting every line
    before anything is written keeps that guarantee outright: a line with no
    price is known to be blocked BEFORE the writes start, and is never in them.
  */
  const blockedWrites: Prisma.PrismaPromise<unknown>[] = [];
  const updates: { invoiceId: string; shipmentId: string; figures: Figures; quoted: Quoted }[] = [];
  const creates: { shipmentId: string; customerId: string; figures: Figures; quoted: Quoted }[] = [];

  for (const shipment of cargo) {
    // Already confirmed, sent, part-paid or paid. Not ours to touch.
    if (shipment.invoice && shipment.invoice.status !== "DRAFT") {
      skipped += 1;
      continue;
    }

    /*
      NOTHING IS BILLED BEFORE IT LANDS.

      "Cargo is priced at Dar check-in and nowhere else" was true of the two
      check-in paths and untrue of the third caller: updateCargo re-prices on a
      corrected weight, and a warehouse holding shipment.amendOutbound can
      correct a consignment that is still in the air. That raised a DRAFT
      against cargo nobody had put on a scale, started the storage clock's
      companion figures early, and left a bill standing if the box never came.

      Only a FIRST bill is refused. A draft that already exists is re-priced as
      before — that is the re-weigh-after-check-in case, and the whole reason
      this call sits in updateCargo. Every caller that legitimately prices sets
      arrivedAt first: both check-in paths write it in the transaction before
      this runs, and cargo added at Dar is created with it.
    */
    if (!shipment.invoice && shipment.arrivedAt === null) {
      skipped += 1;
      continue;
    }

    const quoted = await quote(
      {
        category: shipment.cargoCategory,
        cargoTypeId: shipment.cargoTypeId,
        weightKg: toNumber(shipment.weightKg),
        quantity: shipment.packages,
      },
      "en",
      pricebook
    );

    if (!quoted.ok) {
      blocked.push({
        trackingNumber: shipment.trackingNumber,
        reason: quoted.message,
      });
      blockedWrites.push(
        prisma.shipment.update({
          where: { id: shipment.id },
          data: {
            pricingBlockedReason: quoted.message,
            pricingCheckedAt: new Date(),
          },
        })
      );
      continue;
    }

    const storageDays = storageDaysFor(shipment.arrivedAt, shipment.deliveredAt);
    /* A waiver survives a re-run. Check-in is re-runnable by design, and a
       draft whose fee Finance already forgave must not come back charged —
       the same rule confirmInvoicePrice applies at confirmation. */
    const waiverStands =
      shipment.invoice !== null &&
      toNumber(shipment.invoice.storageWaivedUsd ?? 0) > 0;
    const storageCharge = waiverStands
      ? 0
      : storageDays * STORAGE_POLICY.perDayUsd;
    const total = quoted.total + storageCharge;
    const totalLocal = rate === null ? null : toLocal(total, rate);

    const figures: Figures = {
      currency: quoted.currency,
      freightCost: new Prisma.Decimal(quoted.total),
      storageDays,
      storageCharge: new Prisma.Decimal(storageCharge),
      /*
        A DRAFT RE-PRICED FROM THE BOOK CARRIES NO AGREED FIGURE.

        `total` above is built from the book's freight, so an override left
        standing is a row that contradicts itself: the bill's own page and its
        PDF both print `freightOverride ?? freightCost` as the freight line,
        and that line then stops summing to the total printed under it. A rate
        column left behind is worse again — the consignment would claim a
        special rate on every screen while being billed at the book's.

        Check-in is re-runnable by design and this is the re-quote, so what a
        desk agreed before the boxes were weighed is deliberately dropped. It
        is DROPPED, not ignored: the audit line for the agreement is still on
        the record, and Finance can agree it again against the real weight.
      */
      freightOverride: null,
      freightRateOverride: null,
      freightOverrideReason: null,
      total: new Prisma.Decimal(total),
      exchangeRate: rate === null ? null : new Prisma.Decimal(rate),
      localCurrency: LOCAL_CURRENCY,
      totalLocal: totalLocal === null ? null : new Prisma.Decimal(totalLocal),
      status: "DRAFT" as const,
    };

    if (shipment.invoice) {
      updates.push({
        invoiceId: shipment.invoice.id,
        shipmentId: shipment.id,
        figures,
        quoted,
      });
    } else {
      creates.push({
        shipmentId: shipment.id,
        customerId: shipment.customerId,
        figures,
        quoted,
      });
    }
  }

  /*
    THE ROUTE'S MINIMUM BILLABLE WEIGHT IS CHARGED ONCE PER CUSTOMER, PER
    FLIGHT — NOT ONCE PER PARCEL.

    Madina lands 0.1 kg and 0.8 kg on the same aircraft. The minimum is 1 kg
    and it was applied to each consignment on its own, so 0.9 kg of cargo
    billed as 2 kg and she was charged the minimum twice. A minimum that is
    charged per parcel is not a minimum, it is a per-parcel fee, and the owner
    ruled it out: "we cannot charge this customer two kg".

    WHAT POOLS, AND WHAT DOES NOT. Only consignments the minimum actually
    inflated — a 50 kg box is never affected and is never touched. They pool
    per RULE, because the minimum belongs to the rule: two parcels priced off
    different rate lines have two different minimums and pooling them would
    mean inventing a rate for the pair. In this rate book the weight rules are
    keyed by CATEGORY rather than by goods type, so a customer's bags and her
    general merchandise land on the same rule and do pool.

    WHERE THE CHARGE GOES. All of it onto the heaviest of them, the rest at
    zero — the owner's choice over splitting it, because a split leaves every
    bill showing a figure that matches no rate per kilo and invites the
    question at the counter.

    ARRIVAL ORDER DOES NOT MATTER. A customer's parcels are checked in when
    they are checked in, so the pool is rebuilt from every one of her
    consignments on that flight whose price is still a draft — not just the
    ones in this run. A bill Finance has already confirmed is left exactly
    where it is and its consignment drops out of the pool; re-pricing a
    confirmed bill is not this function's business.
  */
  await poolTheMinimum({ creates, updates, cargo, rate, pricebook });

  /** What check-in stamps back onto the consignment beside its draft. */
  const stamp = (quoted: Quoted) => ({
    quotedAmount: new Prisma.Decimal(quoted.total),
    quoteCurrency: quoted.currency,
    quotedMethod: quoted.method,
    quotedRate: new Prisma.Decimal(quoted.rate),
    chargeableKg:
      quoted.chargeableWeightKg === null
        ? null
        : new Prisma.Decimal(quoted.chargeableWeightKg),
    currency: quoted.currency,
    pricingBlockedReason: null,
    pricingCheckedAt: new Date(),
  });

  /*
    WRITTEN IN SLICES, SO A FAILURE COSTS ONE SLICE.

    The old shape was a transaction per consignment, for a stated reason: a
    rate book gap on line forty must not roll back the thirty-nine drafts
    before it. Quoting first removes the pricing half of that — a line with no
    price never reaches these writes at all — but it does not remove the other
    half. A database error on line forty in ONE batch would still discard the
    thirty-nine, which is a worse failure than the one this was speeding up.

    Twenty at a time keeps effectively all of the round-trip saving, because
    what cost the time was the begin-and-commit per consignment rather than
    per flight, and bounds a failure to the slice it happened in. What
    committed before it stands, and check-in is re-runnable by design.
  */
  const SLICE = 20;
  const sliced = <T,>(rows: T[]) => {
    const out: T[][] = [];
    for (let i = 0; i < rows.length; i += SLICE) out.push(rows.slice(i, i + SLICE));
    return out;
  };

  let priced = 0;

  /* The re-run path: every draft already exists, so this is pure updates. */
  for (const slice of sliced(updates)) {
    await prisma.$transaction(
      slice.flatMap((row) => [
        prisma.invoice.update({
          where: { id: row.invoiceId },
          data: row.figures,
        }),
        prisma.shipment.update({
          where: { id: row.shipmentId },
          data: stamp(row.quoted),
        }),
      ])
    );
    priced += slice.length;
  }

  /*
    The first run. The numbers are taken INSIDE the slice's own transaction,
    so a slice that rolls back rolls its numbers back with it — taking them
    outside left a hole in the invoice sequence that no document explains, and
    an unexplained gap in a numbered financial series is the thing an auditor
    asks about first.
  */
  for (const slice of sliced(creates)) {
    await prisma.$transaction(async (tx) => {
      const numbers = await reserveInvoiceNumbers(tx, slice.length);
      for (const [i, row] of slice.entries()) {
        await tx.invoice.create({
          data: {
            ...row.figures,
            invoiceNumber: numbers[i]!,
            shipmentId: row.shipmentId,
            customerId: row.customerId,
            issuedById: actorId,
          },
        });
        await tx.shipment.update({
          where: { id: row.shipmentId },
          data: stamp(row.quoted),
        });
      }
    });
    priced += slice.length;
  }

  /*
    LAST, AND NEVER IN FRONT OF THE MONEY.

    A blocked reason is advisory — it is re-derived on the next pricing run —
    while a draft that was never raised does not come back on its own. These
    used to run first as one transaction, so a failure writing a cosmetic
    sentence discarded every invoice on the flight. Each stands alone now and
    a failure among them is not allowed to take the drafts down.
  */
  for (const write of blockedWrites) {
    try {
      await write;
    } catch {
      /* The next check-in re-derives it. Nothing here is money. */
    }
  }

  return { priced, skipped, blocked };
}

/** A cent. Money comparisons never test decimals for equality. */
const CENT = 0.005;
/** Weights are stored to three places; a gram is the smallest real difference. */
const GRAM = 0.0005;

type PoolRow = {
  shipmentId: string;
  trackingNumber: string;
  customerId: string;
  batchId: string | null;
  figures: Figures;
  quoted: Quoted;
  /** Present for a consignment whose draft already exists. */
  invoiceId?: string;
  /**
   * The pending write this row speaks for, when it is in this run.
   *
   * `quoted` is replaced rather than mutated — it is a frozen-shaped value
   * built by quote() — so the new one has to be handed back to the row the
   * writer will actually read. Without this the invoice carried the pooled
   * freight while the consignment beside it was stamped with the rate book's
   * own figure, and the bill's working printed a weight times a rate that did
   * not sum to the total underneath it.
   */
  row?: { figures: Figures; quoted: Quoted };
};

/**
 * Did the route's minimum billable weight inflate this quote, and nothing else?
 *
 * Both halves matter. The first picks out the consignments the pool is for —
 * a box above the minimum is priced on its own weight and must not move. The
 * second is a refusal to touch a quote this function does not fully
 * understand: a rule may also carry a minimum CHARGE, which lifts the total
 * without touching the weight, and a pool built on `chargeable × rate` would
 * quietly drop that floor. Where the arithmetic does not reconcile, the
 * consignment keeps the price the rate book gave it.
 */
function minimumBit(q: Quoted): boolean {
  if (q.method !== "WEIGHT_BASED" || q.chargeableWeightKg === null) return false;
  if (q.chargeableWeightKg <= q.actualWeightKg + GRAM) return false;
  return Math.abs(q.total - q.chargeableWeightKg * q.rate) <= CENT;
}

/**
 * Rebuild each affected customer's pool and move the charge onto one bill.
 *
 * Mutates the `figures` this run is about to write, and appends updates for
 * sibling drafts that were priced on an earlier check-in. Called before any
 * write, so a pool that cannot be built leaves every quote exactly as the rate
 * book gave it.
 */
async function poolTheMinimum(args: {
  creates: { shipmentId: string; customerId: string; figures: Figures; quoted: Quoted }[];
  updates: { invoiceId: string; shipmentId: string; figures: Figures; quoted: Quoted }[];
  cargo: { id: string; trackingNumber: string; customerId: string; batchId: string | null }[];
  rate: number | null;
  pricebook: Awaited<ReturnType<typeof quoteContext>>;
}) {
  const { creates, updates, cargo, rate, pricebook } = args;
  const byId = new Map(cargo.map((c) => [c.id, c]));

  /* Only the consignments this run inflated, and only those on a flight — a
     box with no batch has no flight to share a minimum with. */
  const seeds: PoolRow[] = [];
  for (const row of [...creates, ...updates]) {
    const ship = byId.get(row.shipmentId);
    if (!ship || ship.batchId === null) continue;
    if (!minimumBit(row.quoted)) continue;
    seeds.push({
      shipmentId: row.shipmentId,
      trackingNumber: ship.trackingNumber,
      customerId: ship.customerId,
      batchId: ship.batchId,
      figures: row.figures,
      quoted: row.quoted,
      invoiceId: "invoiceId" in row ? row.invoiceId : undefined,
      row,
    });
  }
  if (seeds.length === 0) return;

  /*
    EVERY SIBLING ON THAT FLIGHT, NOT JUST THE ONES IN THIS RUN.

    A confirmed, sent or paid bill is excluded by the same rule the rest of
    this file follows: it is not a draft, so it is not ours to move. Its
    consignment simply is not in the pool, and the ones that are still share
    the minimum between them.
  */
  const pairs = Array.from(
    new Set(seeds.map((s) => `${s.customerId}|${s.batchId}`))
  ).map((key) => {
    const [customerId, batchId] = key.split("|");
    return { customerId, batchId };
  });

  const siblings = await prisma.shipment.findMany({
    where: {
      deletedAt: null,
      OR: pairs.map((p) => ({ customerId: p.customerId, batchId: p.batchId })),
      NOT: { id: { in: seeds.map((s) => s.shipmentId) } },
      invoice: { is: { status: "DRAFT" } },
    },
    select: {
      id: true,
      trackingNumber: true,
      customerId: true,
      batchId: true,
      cargoCategory: true,
      cargoTypeId: true,
      weightKg: true,
      packages: true,
      invoice: { select: { id: true, storageDays: true, storageCharge: true } },
    },
  });

  const members: PoolRow[] = [...seeds];
  for (const sib of siblings) {
    const q = await quote(
      {
        category: sib.cargoCategory,
        cargoTypeId: sib.cargoTypeId,
        weightKg: toNumber(sib.weightKg),
        quantity: sib.packages,
      },
      "en",
      pricebook
    );
    if (!q.ok || !minimumBit(q) || !sib.invoice) continue;
    /* The sibling's own storage stands — the pool moves freight and nothing
       else. Its figures are rebuilt here only because this run is about to
       write a new freight onto it. */
    const storage = toNumber(sib.invoice.storageCharge);
    members.push({
      shipmentId: sib.id,
      trackingNumber: sib.trackingNumber,
      customerId: sib.customerId,
      batchId: sib.batchId,
      invoiceId: sib.invoice.id,
      quoted: q,
      figures: {
        currency: q.currency,
        freightCost: new Prisma.Decimal(q.total),
        storageDays: sib.invoice.storageDays,
        storageCharge: new Prisma.Decimal(storage),
        freightOverride: null,
        freightRateOverride: null,
        freightOverrideReason: null,
        total: new Prisma.Decimal(q.total + storage),
        exchangeRate: rate === null ? null : new Prisma.Decimal(rate),
        localCurrency: LOCAL_CURRENCY,
        totalLocal: rate === null ? null : new Prisma.Decimal(toLocal(q.total + storage, rate)),
        status: "DRAFT",
      },
      /* Marked so the writer below knows this one was not in the run. */
    });
  }

  /* Per customer, per flight, per RULE — the minimum belongs to the rule. */
  const groups = new Map<string, PoolRow[]>();
  for (const m of members) {
    const key = `${m.customerId}|${m.batchId}|${m.quoted.ruleId}`;
    const list = groups.get(key);
    if (list) list.push(m);
    else groups.set(key, [m]);
  }

  for (const [, group] of groups) {
    if (group.length < 2) continue;

    const minKg = group[0].quoted.chargeableWeightKg!;
    const rateKg = group[0].quoted.rate;
    /* One rule, so one minimum and one rate. If the rate book has been edited
       between two check-ins the members can disagree; leave them alone rather
       than pick a winner. */
    if (
      group.some(
        (m) =>
          Math.abs(m.quoted.chargeableWeightKg! - minKg) > GRAM ||
          Math.abs(m.quoted.rate - rateKg) > CENT
      )
    ) {
      continue;
    }

    const combined = group.reduce((kg, m) => kg + m.quoted.actualWeightKg, 0);
    const chargeable = Math.max(combined, minKg);
    const pooledFreight = Math.round(chargeable * rateKg * 100) / 100;

    /*
      THE HEAVIEST CARRIES IT, AND THE TIE IS BROKEN ON THE TRACKING NUMBER.

      Not on whichever the database happened to return first: check-in is
      re-runnable by design, and a carrier that moved between two runs would
      shuffle the charge from one of a customer's bills to another for no
      reason anybody could see.
    */
    const carrier = [...group].sort(
      (a, b) =>
        b.quoted.actualWeightKg - a.quoted.actualWeightKg ||
        a.trackingNumber.localeCompare(b.trackingNumber)
    )[0];

    for (const m of group) {
      const freight = m === carrier ? pooledFreight : 0;
      const storage = toNumber(m.figures.storageCharge);
      const total = Math.round((freight + storage) * 100) / 100;
      m.figures.freightCost = new Prisma.Decimal(freight);
      m.figures.total = new Prisma.Decimal(total);
      m.figures.totalLocal =
        rate === null ? null : new Prisma.Decimal(toLocal(total, rate));
      /* The consignment's own working follows the figure, so its page and its
         PDF do not print a rate times a weight that misses the total. */
      m.quoted = {
        ...m.quoted,
        total: freight,
        chargeableWeightKg: m === carrier ? chargeable : m.quoted.actualWeightKg,
      };
      /* Handed back to the pending write, which reads its own copy. */
      if (m.row) m.row.quoted = m.quoted;
    }

    /* Siblings that were not in this run still need writing. */
    for (const m of group) {
      const already =
        creates.some((c) => c.shipmentId === m.shipmentId) ||
        updates.some((u) => u.shipmentId === m.shipmentId);
      if (already || !m.invoiceId) continue;
      updates.push({
        invoiceId: m.invoiceId,
        shipmentId: m.shipmentId,
        figures: m.figures,
        quoted: m.quoted,
      });
    }
  }
}
