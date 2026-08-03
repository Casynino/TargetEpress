import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, FileText } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { VerificationList } from "@/components/app/verification-list";
import { BatchStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { ORIGIN_LABELS } from "@/lib/constants";
import { formatDate, formatWeight, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Check in cargo" };

export default async function VerifyBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("batch.verify");
  const { id } = await params;

  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      shipments: {
        orderBy: { registeredAt: "desc" },
        include: {
          customer: { select: { name: true, phone: true } },
          packageList: {
            select: {
              id: true,
              sequence: true,
              reference: true,
              weightKg: true,
              receivedAt: true,
            },
            orderBy: { sequence: "asc" },
          },
          // What Guangzhou photographed. The operator holds the box and
          // compares. Nested relation loads are one query for the whole page,
          // not one per row — this list is eighty-seven long.
          photos: {
            where: { kind: { in: ["CARGO", "PACKAGING"] } },
            select: { id: true, url: true, kind: true, caption: true },
            orderBy: { createdAt: "asc" },
            take: 6,
          },
        },
      },
      verifications: true,
    },
  });

  if (!batch) notFound();

  const verificationByShipment = new Map(
    batch.verifications.map((v) => [v.shipmentId, v])
  );

  // The China-side note is internal — it never leaves this permission.
  const showInternal = can(user.role, "shipment.viewInternal");

  return (
    <>
      <PageHeader
        title={`Check in ${batch.batchNumber}`}
        description={`${ORIGIN_LABELS[batch.origin]} · ${batch.airline ?? "—"} ${batch.flightNumber ?? ""} · arrived ${formatDate(batch.arrivalDate)}`}
        actions={
          <>
            <BatchStatusBadge status={batch.status} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/batches/${batch.id}/manifest`}>
                <FileText className="mr-2 h-4 w-4" />
                Manifest
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/receive">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
          </>
        }
      />

      <VerificationList
        batchId={batch.id}
        batchStatus={batch.status}
        shipments={batch.shipments.map((shipment) => {
          const verification = verificationByShipment.get(shipment.id);
          return {
            id: shipment.id,
            trackingNumber: shipment.trackingNumber,
            customerName: shipment.customer.name,
            customerPhone: shipment.customer.phone,
            packages: shipment.packages,
            packageType: shipment.packageType,
            packageList: shipment.packageList.map((pkg) => ({
              id: pkg.id,
              sequence: pkg.sequence,
              reference: pkg.reference,
              // Formatted here so the Decimal never crosses into the client as
              // a float. Null means the desk never weighed this box alone.
              weightLabel: pkg.weightKg ? formatWeight(pkg.weightKg) : null,
              received: pkg.receivedAt !== null,
            })),
            photos: shipment.photos,
            weightKg: toNumber(shipment.weightKg),
            description: shipment.description,
            goodsType: shipment.goodsType,
            origin: shipment.origin,
            cartonRef: shipment.cartonRef,
            internalNote: showInternal ? shipment.internalNotes : null,
            status: shipment.status,
            verification: verification
              ? { result: verification.result, note: verification.note }
              : null,
          };
        })}
      />
    </>
  );
}
