import { NextResponse } from "next/server";

import {
  cardFileName,
  pdfHeaders,
  renderLabelPdf,
  type LabelPdfInput,
} from "@/lib/card-pdf";
import { formatPackages } from "@/lib/constants";
import { formatDate, formatWeight } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { packageQrDataUrl } from "@/lib/qr";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

/**
 * The labels for one shipment, as a file.
 *
 * One page per package, same 100 x 150mm card the browser prints. Downloading
 * matters because a print dialog produces nothing you can keep: a carton whose
 * sticker peels off in the rain needs a reprint from whoever has the file, not
 * a trip back to the desk that made it.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // The same gate as the label page: every desk may look a box up, only the
  // desk that packs it may produce its sticker.
  await requirePermission("label.print");
  const { id } = await params;
  const key = decodeURIComponent(id);
  const locale = await viewerLocale();

  const shipment = await prisma.shipment.findUnique({
    where: key.startsWith("TX-")
      ? { trackingNumber: key.toUpperCase() }
      : { id: key },
    select: {
      trackingNumber: true,
      ...selectText("description"),
      weightKg: true,
      packageType: true,
      registeredAt: true,
      customer: { select: { name: true } },
      packageList: {
        select: { sequence: true, reference: true, qrToken: true },
        orderBy: { sequence: "asc" },
      },
    },
  });

  if (!shipment) {
    return NextResponse.json(
      { error: t(locale, "Cargo not found.") },
      { status: 404 }
    );
  }

  const labels: LabelPdfInput[] = await Promise.all(
    shipment.packageList.map(async (pkg) => ({
      trackingNumber: shipment.trackingNumber,
      packageRef: pkg.reference,
      customerName: shipment.customer.name,
      description: cargoText(locale, shipment, "description"),
      weightLabel: formatWeight(shipment.weightKg),
      packagesLabel: formatPackages(
        shipment.packageList.length,
        shipment.packageType
      , locale),
      registeredOn: formatDate(shipment.registeredAt, locale),
      sequence: pkg.sequence,
      packages: shipment.packageList.length,
      // 500px across a 58mm square is ~11 pixels per QR module — matched to
      // what a 203dpi thermal head can actually lay down, and cheap enough that
      // a batch of 150 labels renders in seconds rather than timing out.
      qr: await packageQrDataUrl(pkg.qrToken, 500),
    }))
  );

  const pdf = renderLabelPdf(labels);
  const fileName = cardFileName(
    shipment.customer.name,
    shipment.trackingNumber,
    "labels"
  );

  return new NextResponse(Buffer.from(pdf), { headers: pdfHeaders(fileName) });
}
