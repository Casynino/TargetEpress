import "server-only";

import { STORAGE_POLICY, storageChargingSince } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/lib/session";
import { chargeStorageOn } from "@/lib/storage-charge";

/**
 * THE METER NOBODY HAS TO PRESS.
 *
 * The owner's rule, in his words: "Storage charges must be added
 * automatically to the cargo/bill every day. The system must calculate the
 * storage amount accurately without anyone manually adding it."
 *
 * Until now the fee accrued on screen and only reached the bill when a desk
 * pressed "Add storage fee". A consignment paid in full and left standing
 * therefore owed nothing the system could enforce: the bill said settled, the
 * pickup note was live, and the counter had no reason to refuse it. The days
 * were counted and never collected.
 *
 * WHY THIS IS SAFE TO RUN AGAIN AND AGAIN. Nothing here increments. Each bill
 * is re-derived from two dates — when the cargo landed and whether it has been
 * collected — and written to what the policy says TODAY. A day the sweep never
 * ran is caught up by the next one; a sweep that runs five times in an hour
 * writes the same figure five times and charges nothing extra. That is why the
 * counter can safely run it too, on the one consignment in front of it.
 *
 * WHAT IT LEAVES ALONE:
 *   · cargo still inside its free week, and cargo already collected — both
 *     come out of storageStatus as nothing to charge;
 *   · a bill somebody waived — that was a decision, and a sweep that put the
 *     days back the next morning would quietly reverse it. Finance's "Charge
 *     it after all" is the way back;
 *   · VOID and WRITTEN_OFF bills, and drafts nobody has confirmed — a draft is
 *     the system's own estimate and gets its storage re-derived when it is
 *     confirmed.
 */
export type MeterRun = {
  looked: number;
  charged: { invoiceNumber: string; tracking: string | null; usd: number }[];
  held: number;
  failed: { invoiceNumber: string; reason: string }[];
};

export async function runStorageMeter(
  opts: {
    /** One consignment, for the counter. Null sweeps everything standing. */
    shipmentId?: string | null;
    /** Recorded as who charged it. Null — the nightly run — records nobody. */
    actor?: SessionUser | null;
    /**
     * Work out what it would do and write nothing.
     *
     * The first real run of a meter that has never run puts every standing
     * day onto every bill at once, and that is a large number appearing in
     * somebody's books without warning. This is how it gets read first.
     */
    dryRun?: boolean;
  } = {}
): Promise<MeterRun> {
  const { shipmentId = null, actor = null, dryRun = false } = opts;

  /*
    Asked of the database rather than walked in memory: on a floor holding a
    few thousand consignments, the ones whose free week has run out and whose
    boxes are still here are a short list, and everything else must not be
    read at all.

    `arrivedAt` before the charging boundary is the free week — the same
    boundary chargeableStorageDays draws, as a date, because Postgres cannot
    subtract now() from a column inside a Prisma filter.
  */
  const bills = await prisma.invoice.findMany({
    where: {
      status: { notIn: ["DRAFT", "VOID", "WRITTEN_OFF"] },
      /* Not yet forgiven. A waiver stops this meter — see the note above. */
      storageWaivedAt: null,
      shipment: {
        ...(shipmentId ? { id: shipmentId } : {}),
        arrivedAt: { not: null, lte: storageChargingSince() },
        /* Still on our floor. The clock stops the day it is handed over. */
        deliveredAt: null,
      },
    },
    select: {
      id: true,
      invoiceNumber: true,
      storageCharge: true,
      shipment: {
        select: { trackingNumber: true, arrivedAt: true, deliveredAt: true },
      },
    },
    orderBy: { issuedAt: "asc" },
  });

  const run: MeterRun = { looked: bills.length, charged: [], held: 0, failed: [] };

  for (const bill of bills) {
    /* What the policy says today, against what the bill already carries. The
       overwhelming majority of a sweep is this comparison finding nothing to
       do, so it is made before anything is written or a transaction opened. */
    const days = bill.shipment?.arrivedAt
      ? Math.floor(
          (Date.now() - bill.shipment.arrivedAt.getTime()) / 86_400_000
        )
      : 0;
    const owed =
      Math.max(0, days - STORAGE_POLICY.freeDays + 1) * STORAGE_POLICY.perDayUsd;
    if (owed <= 0) continue;
    if (Math.abs(toNumber(bill.storageCharge) - owed) < 0.005) continue;

    if (dryRun) {
      run.charged.push({
        invoiceNumber: bill.invoiceNumber,
        tracking: bill.shipment?.trackingNumber ?? null,
        usd: owed,
      });
      continue;
    }

    try {
      const outcome = await chargeStorageOn(bill.id, actor, "en", {
        respectWaiver: true,
      });
      if (outcome.charged) {
        run.charged.push({
          invoiceNumber: bill.invoiceNumber,
          tracking: bill.shipment?.trackingNumber ?? null,
          usd: outcome.usd,
        });
        if (outcome.held === "held") run.held += 1;
      }
    } catch (error) {
      /*
        One bill's failure is not the sweep's. A row somebody is editing at
        that exact second loses its conditional claim and throws; the next run
        picks it up, because nothing here depends on the last one having
        worked.
      */
      run.failed.push({
        invoiceNumber: bill.invoiceNumber,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return run;
}
