import type { Prisma } from "@prisma/client";
import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, Hourglass, PackageCheck, Scale, Wallet } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import {
  InventoryTable,
  type InventoryRow,
} from "@/components/app/inventory-table";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import {
  EXCEPTION_OPEN_STATUSES,
  STORAGE_POLICY,
} from "@/lib/constants";
import { ON_THE_FLOOR, weightOnFloor } from "@/lib/floor";
import { formatDate, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Warehouse inventory" };

const DAY_MS = 86_400_000;

/**
 * Warehouse Inventory — what is physically standing in the Dar warehouse now.
 *
 * "Now" is exactly two statuses: RECEIVED_AT_DAR (checked in off the manifest)
 * and READY_FOR_PICKUP (checked in and paid for). Anything DELIVERED has left
 * the building and anything still IN_TRANSIT has not arrived, so neither is
 * stock. Soft-deleted cargo is excluded like everywhere else.
 *
 * PRICE VISIBILITY — THE OWNER'S RULE:
 * Warehouse users may not see shipping prices or any money figure. So this page
 * never selects an amount: not `quotedAmount`, not the invoice, not
 * `pickupNote.amountPaid`. What the floor gets is the one payment fact it needs
 * to do its job — cleared or not cleared — derived from whether an ACTIVE
 * pickup note exists. Finance decides that; the warehouse only reads it. Not
 * selecting the figures is deliberate rather than merely not rendering them:
 * a value never fetched cannot leak through a serialised prop, an expanded row
 * or a future edit to the table.
 */
export default async function InventoryPage() {
  await requirePermission("inventory.view");

  const held = await prisma.shipment.findMany({
    // The one definition of "on the floor", shared with the dashboard so the
    // two screens can never report different stock.
    where: ON_THE_FLOOR,
    // Longest-held first: the cargo that has been sitting the longest is the
    // cargo somebody needs to chase.
    orderBy: [{ arrivedAt: "asc" }, { createdAt: "asc" }],
    take: 500,
    select: {
      id: true,
      trackingNumber: true,
      status: true,
      description: true,
      packages: true,
      packageType: true,
      weightKg: true,
      cartonRef: true,
      arrivedAt: true,
      customer: { select: { name: true, phone: true } },
      batch: { select: { batchNumber: true } },
      // Note number, status and issue date only. `amountPaid` is on this
      // relation and is deliberately not selected — see the rule above.
      pickupNote: { select: { noteNumber: true, status: true, issuedAt: true } },
      // Manifest packages still unticked. Usually empty, and when it is not,
      // the shipment is short and must not go out.
      // Every package, with whether it arrived and what it weighs. The pending
      // count and the weight on the floor are both read off this.
      packageList: { select: { id: true, receivedAt: true, weightKg: true } },
      exceptions: { where: { status: { in: [...EXCEPTION_OPEN_STATUSES] } }, select: { id: true } },
    },
  });

  // One clock for the whole page, so two rows received a minute apart cannot
  // disagree about what day it is.
  const now = Date.now();

  const rows: InventoryRow[] = held.map((shipment) => {
    const note = shipment.pickupNote;
    // The note is the source of truth for "paid", not the shipment status:
    // cancelling a note reverts the status, but reading the note directly means
    // this page cannot drift from what Finance actually issued.
    const paid = note !== null && note.status === "ACTIVE";

    return {
      id: shipment.id,
      trackingNumber: shipment.trackingNumber,
      status: shipment.status as InventoryRow["status"],
      customerName: shipment.customer.name,
      customerPhone: shipment.customer.phone,
      description: shipment.description,
      packages: shipment.packages,
      packageType: shipment.packageType,
      packagesPending: shipment.packageList.filter((pkg) => !pkg.receivedAt)
        .length,
      weightKg: toNumber(shipment.weightKg),
      // Weight of what is actually standing here.
      //
      // A shipment checked in short keeps its full declared weight on the
      // paperwork, so summing declared weight told the floor it was holding
      // kilos that never landed. Per-package weights are used when the desk
      // recorded them; otherwise the declared total is pro-rated by how many
      // boxes arrived, which is the best answer the data supports and is
      // stated rather than hidden.
      weightHereKg: weightOnFloor(
        toNumber(shipment.weightKg),
        shipment.packageList
      ),
      batchNumber: shipment.batch?.batchNumber ?? null,
      cartonRef: shipment.cartonRef,
      arrivedLabel: shipment.arrivedAt ? formatDate(shipment.arrivedAt) : "Not recorded",
      arrivedIso: shipment.arrivedAt ? shipment.arrivedAt.toISOString() : null,
      daysHeld: shipment.arrivedAt
        ? Math.max(0, Math.floor((now - shipment.arrivedAt.getTime()) / DAY_MS))
        : null,
      openExceptions: shipment.exceptions.length,
      paid,
      pickupNoteNumber: paid ? (note?.noteNumber ?? null) : null,
      clearedLabel: paid && note ? formatDate(note.issuedAt) : null,
    };
  });

  const unpaid = rows.filter((row) => !row.paid);
  const cleared = rows.filter((row) => row.paid);
  // Boxes actually ticked off the manifest, not boxes declared in China. A
  // shipment checked in short — or flagged on a count mismatch — is on the
  // floor with fewer cartons than its paperwork claims, and this hint says
  // what is standing there.
  const totalPackages = rows.reduce(
    (sum, row) => sum + row.packages - row.packagesPending,
    0
  );
  const totalWeight = rows.reduce((sum, row) => sum + row.weightHereKg, 0);
  const aging = rows.filter(
    (row) => row.daysHeld !== null && row.daysHeld > STORAGE_POLICY.freeDays
  );
  const longestHeld = rows.reduce(
    (max, row) => Math.max(max, row.daysHeld ?? 0),
    0
  );

  return (
    <>
      <PageHeader
        title="Warehouse inventory"
        description="Every piece of cargo standing in the Dar warehouse right now — checked in, not yet handed over."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="The floor is clear"
          description="Nothing is being held in Dar. Cargo appears here the moment it is checked in against a batch manifest."
        />
      ) : (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              delay={0}
              label="Cargo held"
              numeric={rows.length}
              hint={`${totalPackages.toLocaleString()} packages on the floor`}
              icon={Boxes}
              tone="brand"
            />
            <KpiCard
              delay={1}
              label="Not yet paid for"
              numeric={unpaid.length}
              hint={
                unpaid.length > 0
                  ? "Stored, waiting on Finance"
                  : "Everything held is cleared"
              }
              icon={Wallet}
              tone={unpaid.length > 0 ? "warning" : "success"}
            />
            <KpiCard
              delay={2}
              label="Cleared for pickup"
              numeric={cleared.length}
              hint="Pickup note issued — collectable"
              icon={PackageCheck}
              tone="success"
              ringPct={rows.length ? (cleared.length / rows.length) * 100 : 0}
              ringLabel="Share of held cargo cleared"
            />
            <KpiCard
              delay={3}
              label={`Held over ${STORAGE_POLICY.freeDays} days`}
              numeric={aging.length}
              hint={
                longestHeld > 0
                  ? `Longest sitting ${longestHeld} days`
                  : "Nothing has aged yet"
              }
              icon={Hourglass}
              tone={aging.length > 0 ? "danger" : "success"}
            />
            <KpiCard
              delay={4}
              label="Weight on the floor"
              value={`${Math.round(totalWeight).toLocaleString()} kg`}
              hint={`Across ${rows.length} shipment${rows.length === 1 ? "" : "s"}`}
              icon={Scale}
              tone="info"
            />
          </div>

          <InventoryTable rows={rows} />

          <p className="mt-6 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
            <PackageCheck className="h-4 w-4" />
            Cargo that has landed but not been checked in yet is on{" "}
            <Link
              href="/app/receive"
              className="font-medium text-brand hover:underline"
            >
              Receive Cargo
            </Link>
            . Cleared cargo is handed over from{" "}
            <Link
              href="/app/release"
              className="font-medium text-brand hover:underline"
            >
              the release counter
            </Link>
            .
          </p>
        </>
      )}
    </>
  );
}
