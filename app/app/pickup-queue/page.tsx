import type { Metadata } from "next";
import { AlertTriangle, Boxes, Hourglass, PackageCheck, Truck } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import {
  PickupQueueTable,
  type PickupQueueRow,
} from "@/components/app/pickup-queue-table";
import {
  EXCEPTION_STATUS_LABELS,
  EXCEPTION_TYPE_LABELS,
  SHIPMENT_STATUS_META,
  formatPackages,
  formatPackagesShort,
  storageDaysFor,
} from "@/lib/constants";
import { formatDate, formatDateTime, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import {
  PICKUP_LOCKING_STATUSES,
  PICKUP_LOCKING_TYPES,
  caseReference,
} from "@/lib/pickup-lock";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Pickup list" };

const DAY = 86_400_000;

/**
 * "4 h", "3 d", "3 d 5 h". Computed server-side so hydration cannot disagree.
 *
 * Takes the reader's locale rather than asking for it: a plain function cannot
 * await, and the page has already resolved it once.
 */
function waitLabel(locale: Locale, ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return t(locale, "just now");
  if (hours < 24) return `${hours} ${t(locale, "h")}`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return rest > 0
    ? `${days} ${t(locale, "d")} ${rest} ${t(locale, "h")}`
    : `${days} ${t(locale, "d")}`;
}

/**
 * The pickup list — everyone who may collect today.
 *
 * A row exists here because Finance issued a pickup note and has not cancelled
 * it: the money question is already answered and is shown as a fact, not as
 * something the warehouse can touch. What is left is the warehouse's own
 * question — are all the boxes actually on the floor — so each row carries the
 * same check `releaseShipment` will run at the counter. Discovering a shortage
 * here is a phone call; discovering it with the customer at the desk is a
 * claim.
 */
export default async function PickupQueuePage() {
  const user = await requirePermission("shipment.release");
  const locale = await viewerLocale();

  // Warehouse staff get the payment FACT, never the figure — the owner's rule
  // is that warehouse users cannot view shipping prices. Finance and the CEO
  // opening this page still see amounts.
  const showMoney = can(user.role, "finance.view");

  const now = new Date();

  const notes = await prisma.pickupNote.findMany({
    where: { status: "ACTIVE", shipment: { deletedAt: null } },
    orderBy: { issuedAt: "asc" },
    select: {
      id: true,
      noteNumber: true,
      amountPaid: true,
      currency: true,
      issuedAt: true,
      issuedBy: { select: { name: true } },
      customer: { select: { id: true, name: true, phone: true } },
      shipment: {
        select: {
          trackingNumber: true,
          ...selectText("description"),
          packages: true,
          packageType: true,
          weightKg: true,
          status: true,
          arrivedAt: true,
          /* Read so the queue does not flag a forgiven fee as still charging —
             the counter would tell the customer to hurry over money the office
             has already written off. */
          invoice: { select: { storageWaivedUsd: true } },
          packageList: {
            select: { sequence: true, receivedAt: true },
            orderBy: { sequence: "asc" },
          },
          // The investigation lock, asked for in the same query the counter's
          // guard asks in — see lib/pickup-lock.ts. Oldest live case only:
          // the row needs to say why it is held, not list everything.
          exceptions: {
            where: {
              status: { in: PICKUP_LOCKING_STATUSES },
              type: { in: PICKUP_LOCKING_TYPES },
            },
            orderBy: { raisedAt: "asc" },
            select: { id: true, type: true, status: true },
            take: 1,
          },
        },
      },
    },
  });

  const rows: PickupQueueRow[] = notes.map((note) => {
    const shipment = note.shipment;
    const packagesTotal = shipment.packageList.length;
    const packagesReceived = shipment.packageList.filter((p) => p.receivedAt).length;
    const missingPackages = shipment.packageList
      .filter((p) => !p.receivedAt)
      .map((p) => p.sequence);

    // Mirrors the guards inside releaseShipment, in the same order. If this
    // list is empty the handover will go through; if it is not, it will not.
    const blockers: string[] = [];
    if (shipment.status !== "READY_FOR_PICKUP") {
      blockers.push(
        `${t(locale, "Cargo is not cleared for release — it is still")} "${t(locale, SHIPMENT_STATUS_META[shipment.status].label)}".`
      );
    }
    const lock = shipment.exceptions[0];
    if (lock) {
      blockers.push(
        `${t(locale, "Under investigation —")} ${t(locale, EXCEPTION_TYPE_LABELS[lock.type])}, ${t(locale, "currently")} "${t(locale, EXCEPTION_STATUS_LABELS[lock.status])}" (${t(locale, "case")} ${caseReference(lock.id)}). ${t(locale, "Locked against pickup until the case is closed.")}`
      );
    }
    if (packagesTotal === 0) {
      blockers.push(
        t(
          locale,
          "No package labels on this cargo, so nothing can be checked in against it."
        )
      );
    } else if (missingPackages.length > 0) {
      blockers.push(
        `${t(locale, "Still missing:")} ${missingPackages.map((n) => `${t(locale, "package")} ${n}`).join(", ")}. ${t(locale, "A partial consignment is never released.")}`
      );
    }

    const waitingMs = Math.max(0, now.getTime() - note.issuedAt.getTime());

    return {
      id: note.id,
      noteNumber: note.noteNumber,
      // Warehouse staff get the fact, never the figure. Gated on the same
      // permission the cargo search uses, so Finance and the CEO still see
      // amounts when they open this page.
      ...(showMoney
        ? { amountPaid: toNumber(note.amountPaid), currency: note.currency }
        : {}),
      issuedAtLabel: formatDateTime(note.issuedAt, locale),
      issuedAtMs: note.issuedAt.getTime(),
      issuedByName: note.issuedBy?.name ?? null,
      waitingMs,
      waitingLabel: waitLabel(locale, waitingMs),
      customerId: note.customer.id,
      customerName: note.customer.name,
      customerPhone: note.customer.phone,
      trackingNumber: shipment.trackingNumber,
      // Resolved here, in the server parent: the queue table runs in the
      // browser and cannot ask who is reading it. Guangzhou's Chinese reads as
      // English at the Dar counter, and stays Chinese in Guangzhou.
      description: cargoText(locale, shipment, "description"),
      weightKg: toNumber(shipment.weightKg),
      packagesLabel: formatPackages(shipment.packages, shipment.packageType, locale),
      packagesShort: formatPackagesShort(shipment.packages, shipment.packageType, locale),
      packagesReceived,
      packagesTotal,
      missingPackages,
      shipmentStatus: shipment.status,
      arrivedAtLabel: shipment.arrivedAt ? formatDate(shipment.arrivedAt, locale) : null,
      storageDays:
        toNumber(shipment.invoice?.storageWaivedUsd ?? 0) > 0
          ? 0
          : storageDaysFor(shipment.arrivedAt, null, now),
      blockers,
      ready: blockers.length === 0,
    };
  });

  const ready = rows.filter((row) => row.ready).length;
  const held = rows.length - ready;
  const boxesWaiting = notes.reduce((sum, note) => sum + note.shipment.packages, 0);
  const charging = rows.filter((row) => row.storageDays > 0).length;
  const longestWait = rows.reduce((max, row) => Math.max(max, row.waitingMs), 0);
  const overAWeek = rows.filter((row) => row.waitingMs >= 7 * DAY).length;

  return (
    <>
      <PageHeader
        title="Pickup list"
        description="Cargo Finance has cleared for collection. Open a row to release it — the pickup note itself is issued and cancelled by Finance."
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Truck}
          title={t(locale, "Nobody is waiting to collect")}
          description={t(
            locale,
            "Cargo joins this queue the moment Finance confirms payment and issues its pickup note."
          )}
        />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard
              delay={0}
              label={t(locale, "Awaiting collection")}
              numeric={rows.length}
              hint={
                longestWait > 0
                  ? `${t(locale, "Longest wait")} ${waitLabel(locale, longestWait)}`
                  : t(locale, "Just issued")
              }
              icon={Truck}
              tone="brand"
            />
            <KpiCard
              delay={1}
              label={t(locale, "Ready to release")}
              numeric={ready}
              hint={t(locale, "Every package accounted for")}
              icon={PackageCheck}
              tone="success"
              ringPct={rows.length > 0 ? (ready / rows.length) * 100 : 0}
              ringLabel={t(locale, "Share of the queue that can be handed over")}
            />
            <KpiCard
              delay={2}
              label={t(locale, "Held back")}
              numeric={held}
              hint={
                held > 0
                  ? t(locale, "Cannot be handed over yet")
                  : t(locale, "Nothing blocked")
              }
              icon={AlertTriangle}
              tone={held > 0 ? "danger" : "success"}
            />
            <KpiCard
              delay={3}
              label={t(locale, "Boxes on the floor")}
              numeric={boxesWaiting}
              hint={t(locale, "Packages held for these customers")}
              icon={Boxes}
              tone="info"
            />
            <KpiCard
              delay={4}
              label={t(locale, "Storage accruing")}
              numeric={charging}
              hint={
                overAWeek > 0
                  ? `${overAWeek} ${t(locale, "waiting over a week")}`
                  : t(locale, "Everyone still inside free storage")
              }
              icon={Hourglass}
              tone={charging > 0 ? "warning" : "success"}
            />
          </div>

          <PickupQueueTable rows={rows} />
        </>
      )}
    </>
  );
}
