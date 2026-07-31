import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, FileText } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { VerificationList } from "@/components/app/verification-list";
import { BatchStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { ORIGIN_LABELS } from "@/lib/constants";
import { formatDate, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Check in cargo" };

export default async function VerifyBatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("batch.verify");
  const { id } = await params;

  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      shipments: {
        orderBy: { trackingNumber: "asc" },
        include: {
          customer: { select: { name: true, phone: true } },
          packageList: {
            select: { id: true, sequence: true, receivedAt: true },
            orderBy: { sequence: "asc" },
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
              received: pkg.receivedAt !== null,
            })),
            weightKg: toNumber(shipment.weightKg),
            description: shipment.description,
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
