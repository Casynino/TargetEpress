import type { Metadata } from "next";
import { Truck } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ReleaseWorkbench } from "@/components/app/release-workbench";
import { formatDateTime, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { storageIsDurable } from "@/lib/storage";

export const metadata: Metadata = { title: "Release cargo" };

export default async function ReleasePage() {
  await requirePermission("shipment.release");

  const notes = await prisma.pickupNote.findMany({
    where: { status: "ACTIVE" },
    orderBy: { issuedAt: "asc" },
    include: {
      customer: { select: { name: true, phone: true } },
      shipment: {
        select: {
          trackingNumber: true,
          packages: true,
          weightKg: true,
          description: true,
          status: true,
        },
      },
    },
  });

  return (
    <>
      <PageHeader
        title="Release cargo"
        description="Scan the customer's pickup note, then scan the cargo. Both must match before anything leaves."
      />

      {notes.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No cargo cleared for release"
          description="Finance issues a pickup note once a shipment is paid for. Cleared cargo appears here."
        />
      ) : (
        <ReleaseWorkbench
          photosDurable={storageIsDurable()}
          notes={notes.map((note) => ({
            id: note.id,
            noteNumber: note.noteNumber,
            issuedAt: formatDateTime(note.issuedAt),
            amountPaid: toNumber(note.amountPaid),
            currency: note.currency,
            customerName: note.customer.name,
            customerPhone: note.customer.phone,
            trackingNumber: note.shipment.trackingNumber,
            packages: note.shipment.packages,
            weightKg: toNumber(note.shipment.weightKg),
            description: note.shipment.description,
          }))}
        />
      )}
    </>
  );
}
