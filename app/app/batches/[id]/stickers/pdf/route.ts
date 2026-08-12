import { NextResponse } from "next/server";

import {
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
 * Rendering 150 codes and deflating 150 images is seconds of CPU, not
 * milliseconds. The platform default would cut the response off mid-file and
 * hand the warehouse a corrupt PDF.
 */
export const maxDuration = 60;

/**
 * The most labels one file will carry.
 *
 * Not a guess: at roughly 70ms of QR and PDF work per label, 400 is where a
 * request starts approaching the ceiling above. Past it the answer is a clear
 * refusal telling somebody to select fewer — never a silent truncation, which
 * would send a warehouse to the floor with labels for cargo the file quietly
 * dropped.
 */
const MAX_LABELS = 400;

/**
 * A whole armful of labels as one file, one page per package.
 *
 * The China bench selects cargo on the batch page and gets a single PDF it can
 * send to a label printer in one job — rather than opening each shipment and
 * printing it, which is the most repeated action in that warehouse.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermission("label.print");
  const locale = await viewerLocale();
  const { id } = await params;
  const ids = new URL(request.url).searchParams.get("ids");

  const selected = (ids ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const batch = await prisma.batch.findUnique({
    where: { id },
    select: { id: true, batchNumber: true },
  });
  if (!batch) {
    return NextResponse.json(
      { error: t(locale, "Batch not found.") },
      { status: 404 }
    );
  }

  const cargo = await prisma.shipment.findMany({
    where: {
      batchId: batch.id,
      ...(selected.length > 0 ? { id: { in: selected } } : {}),
    },
    orderBy: { registeredAt: "desc" },
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

  const labels: LabelPdfInput[] = await Promise.all(
    cargo.flatMap((item) =>
      item.packageList.map(async (pkg) => ({
        trackingNumber: item.trackingNumber,
        packageRef: pkg.reference,
        customerName: item.customer.name,
        // The label is read by whoever printed it, so it carries their
        // language — Chinese on the Guangzhou bench, English in Dar.
        description: cargoText(locale, item, "description"),
        weightLabel: formatWeight(item.weightKg),
        packagesLabel: formatPackages(
          item.packageList.length,
          item.packageType
        , locale),
        registeredOn: formatDate(item.registeredAt, locale),
        sequence: pkg.sequence,
        packages: item.packageList.length,
        qr: await packageQrDataUrl(pkg.qrToken, 500),
      }))
    )
  );

  if (labels.length === 0) {
    return NextResponse.json(
      { error: t(locale, "No cargo selected to label.") },
      { status: 404 }
    );
  }

  if (labels.length > MAX_LABELS) {
    return NextResponse.json(
      {
        error:
          `${t(locale, "That is")} ${labels.length} ${t(locale, "labels in one file, more than this can build in one go.")} ` +
          `${t(locale, "Select up to")} ${MAX_LABELS} ${t(locale, "packages' worth of cargo on the batch page and download them in runs.")}`,
      },
      { status: 413 }
    );
  }

  const pdf = renderLabelPdf(labels);
  // Named for the batch, not a customer: this file is many customers' cargo.
  const full = `${batch.batchNumber} labels.pdf`;

  return new NextResponse(Buffer.from(pdf), {
    headers: pdfHeaders({ full, ascii: full.replace(/[^\x20-\x7E]/g, "") }),
  });
}
