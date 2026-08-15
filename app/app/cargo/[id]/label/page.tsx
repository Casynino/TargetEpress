import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { CargoSticker, type StickerData } from "@/components/app/cargo-sticker";
import { PrintBar } from "@/components/app/print-bar";
import { Button } from "@/components/ui/button";
import { formatPackages } from "@/lib/constants";
import { formatDate, formatWeight } from "@/lib/format";
import { recordAudit } from "@/lib/audit";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { LABEL_MM } from "@/lib/print";
import { packageQrDataUrl } from "@/lib/qr";
import { requirePermission } from "@/lib/session";
import { cargoText, viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Cargo labels") };
}

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
  const locale = await viewerLocale();
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
      description: cargoText(locale, shipment, "description"),
      packages: shipment.packageList.length,
      packagesLabel: formatPackages(
        shipment.packageList.length,
        shipment.packageType
      , locale),
      weightLabel: formatWeight(shipment.weightKg),
      registeredOn: formatDate(shipment.registeredAt, locale),
      sequence: pkg.sequence,
      packageRef: pkg.reference,
      // 500px across a 58mm square is ~11 pixels per QR module — matched to
      // what a 203dpi thermal head can actually lay down, and cheap enough that
      // a batch of 150 labels renders in seconds rather than timing out.
      qr: await packageQrDataUrl(pkg.qrToken, 500),
    }))
  );

  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      <div className="no-print">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/app/cargo/${shipment.trackingNumber}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t(locale, "Back to cargo")}
          </Link>
        </Button>
      </div>

      <PrintBar
        item={LABEL_MM}
        printLabel={`${t(locale, "Print")} ${stickers.length} ${t(locale, stickers.length === 1 ? "label" : "labels")}`}
        downloadHref={`/app/cargo/${shipment.trackingNumber}/label/pdf`}
        downloadLabel={t(locale, "Download PDF")}
        hint={t(locale, "One code per box — never copy a label onto two.")}
      />

      <div className="flex flex-col items-center gap-4 print:gap-0">
        {stickers.map((sticker) => (
          <CargoSticker key={sticker.packageRef} data={sticker} />
        ))}
      </div>
    </div>
  );
}
