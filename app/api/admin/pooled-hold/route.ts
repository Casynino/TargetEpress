import { NextResponse } from "next/server";

import { poolHold } from "@/lib/minimum-pool";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { currentUser } from "@/lib/session";

/**
 * THE ONE-OFF PASS, AS A LINK.
 *
 * Cargo cleared before the pooled-pickup rule existed is still standing at
 * READY_FOR_PICKUP with its charge unpaid: the list says ready and the counter
 * refuses it. This puts those parcels back where an unpaid consignment
 * belongs, so the screens stop disagreeing with each other.
 *
 * A LINK RATHER THAN A SCRIPT because the person who needs to run it does not
 * have a terminal. ?dry=1 lists what it would do and writes nothing; without
 * it, it does it. Short output either way — a few tracking numbers, not a
 * page of JSON nobody can read.
 *
 * NOTHING ABOUT MONEY IS TOUCHED: no bill, no total, no payment. Only where
 * the cargo stands. The pickup note each parcel holds is left alive — it is
 * unique per consignment and can never be reissued, so cancelling it would
 * strand the cargo for ever. Paying the charge puts the parcel back against
 * that same note.
 *
 * New cases cannot arise: confirmation no longer clears a pooled parcel. So
 * this is deliberately not on a schedule.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const user = await currentUser();
  /* The desks that settle these bills, which is who would be asked to run it. */
  if (!user || !can(user.role, "invoice.edit")) {
    return NextResponse.json({ error: "Not authorised" }, { status: 403 });
  }
  /* Looking as somebody is view-only, and this route writes on a plain request. */
  if (user.impersonatedBy) {
    return NextResponse.json({ error: "View-only while working as someone" }, { status: 403 });
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";

  const cleared = await prisma.shipment.findMany({
    where: { status: "READY_FOR_PICKUP", deliveredAt: null, deletedAt: null },
    select: {
      id: true,
      trackingNumber: true,
      customer: { select: { name: true } },
      batch: { select: { batchNumber: true } },
    },
  });

  const held: string[] = [];
  for (const shipment of cleared) {
    const hold = await poolHold(shipment.id);
    if (!hold) continue;
    held.push(
      `${shipment.trackingNumber} · ${shipment.customer.name} · ${shipment.batch?.batchNumber ?? "—"} · charge on ${hold.carrierTracking}, ${hold.currency} ${hold.owed.toFixed(2)} owing`
    );
    if (dry) continue;

    await prisma.$transaction(async (tx) => {
      const moved = await tx.shipment.updateMany({
        where: { id: shipment.id, status: "READY_FOR_PICKUP" },
        data: { status: "RECEIVED_AT_DAR" },
      });
      if (moved.count === 0) return;
      await tx.shipmentStatusHistory.create({
        data: {
          shipmentId: shipment.id,
          fromStatus: "READY_FOR_PICKUP",
          toStatus: "RECEIVED_AT_DAR",
          location: "Dar es Salaam warehouse",
          note: `This parcel carries no charge of its own — the shared minimum is on ${hold.carrierTracking}, which is unpaid. Held until that is settled; the pickup note it holds stands.`,
          actorId: user.id,
        },
      });
    });
  }

  return NextResponse.json({
    ok: true,
    mode: dry ? "dry run — nothing was changed" : "applied",
    lookedAt: cleared.length,
    affected: held.length,
    parcels: held,
    moneyTouched: "none",
  });
}
