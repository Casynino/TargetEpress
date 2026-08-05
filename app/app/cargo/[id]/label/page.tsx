import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { CargoSticker, type StickerData } from "@/components/app/cargo-sticker";
import { PrintButton } from "@/components/app/print-button";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS } from "@/lib/cargo";
import { formatPackages } from "@/lib/constants";
import { formatWeight } from "@/lib/format";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { packageQrDataUrl } from "@/lib/qr";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Cargo labels" };

/**
 * Labels for one shipment — one per box.
 *
 * Five cartons is five labels, each with a different QR, each numbered "3 of 5".
 * Printing a single label and copying it was the old behaviour and it is exactly
 * what makes a missing box invisible until the customer is at the counter.
 */
export default async function LabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  // Not shipment.view. Every desk may look a box up; only the desk that packs
  // it may produce its sticker. ROUTE_PERMISSIONS cannot express this — it
  // matches on prefixes, and /app/cargo already resolves to shipment.view — so
  // this guard is the whole gate rather than a second line behind middleware.
  const user = await requirePermission("label.print");
  const { id } = await params;
  const key = decodeURIComponent(id);

  const shipment = await prisma.shipment.findUnique({
    where: key.startsWith("TX-") ? { trackingNumber: key.toUpperCase() } : { id: key },
    include: {
      customer: true,
      batch: true,
      cargoType: { select: { name: true } },
      packageList: { orderBy: { sequence: "asc" } },
    },
  });

  if (!shipment) notFound();

  // Opening this page is the only signal we have that labels were printed —
  // the browser's print dialog is invisible to us. It over-counts a reprint
  // that was abandoned, which is the safer direction: a label that was printed
  // and not counted would let a missing sticker look like it never existed.
  await recordAudit({
    actor: user,
    action: "label.print",
    entity: "Shipment",
    entityId: shipment.id,
    summary: `Printed ${shipment.packageList.length} label(s) for ${shipment.trackingNumber}`,
    metadata: {
      trackingNumber: shipment.trackingNumber,
      labels: shipment.packageList.length,
    },
  });

  const stickers: StickerData[] = await Promise.all(
    shipment.packageList.map(async (pkg) => ({
      trackingNumber: shipment.trackingNumber,
      customerName: shipment.customer.name,
      customerPhone: shipment.customer.phone,
      customerCity: shipment.customer.city,
      description: shipment.description,
      cargoTypeName: shipment.cargoType?.name ?? null,
      categoryLabel: CATEGORY_LABELS[shipment.cargoCategory],
      packages: shipment.packageList.length,
      packagesLabel: formatPackages(
        shipment.packageList.length,
        shipment.packageType
      ),
      weightLabel: formatWeight(shipment.weightKg),
      origin: shipment.origin,
      batchNumber: shipment.batch?.batchNumber ?? null,
      sequence: pkg.sequence,
      packageRef: pkg.reference,
      qr: await packageQrDataUrl(pkg.qrToken, 170),
    }))
  );

  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/app/cargo/${shipment.trackingNumber}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to shipment
            </Link>
          </Button>
          <p className="mt-1 text-sm text-muted-foreground">
            {stickers.length} label{stickers.length === 1 ? "" : "s"} —{" "}
            {formatPackages(stickers.length, shipment.packageType)} in this
            shipment, one code each.
          </p>
        </div>
        <PrintButton
          label={`Print ${stickers.length} label${stickers.length === 1 ? "" : "s"}`}
        />
      </div>

      <div className="space-y-6">
        {stickers.map((sticker) => (
          <CargoSticker key={sticker.packageRef} data={sticker} />
        ))}
      </div>

      <p className="no-print mt-4 text-center text-xs text-muted-foreground">
        Print at 100% scale. Every package gets its own label — never copy one
        label onto two boxes, or the warehouse cannot tell them apart.
      </p>
    </div>
  );
}
