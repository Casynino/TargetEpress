import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { CargoSticker, type StickerData } from "@/components/app/cargo-sticker";
import { PrintFormatBar } from "@/components/app/print-format";
import { Button } from "@/components/ui/button";
import { formatPackages } from "@/lib/constants";
import { formatDate, formatWeight } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { LABEL_MM, printFormatFrom } from "@/lib/print";
import { packageQrDataUrl } from "@/lib/qr";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Print stickers" };

/**
 * Stickers for a whole armful of cargo at once.
 *
 * The alternative was opening each shipment and printing it, which is the
 * single most repeated action in the warehouse and the one most worth removing.
 * Selection happens on the batch page; this page only renders what was chosen.
 *
 * Every QR is generated server-side so the page is print-ready on first paint —
 * a browser print dialog will not wait for images that are still being drawn.
 */
export default async function BatchStickersPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ids?: string; format?: string }>;
}) {
  // The whole-batch sticker sheet. Same rule as a single label: the desk that
  // packs the cargo prints for it. /app/batches resolves to batch.view in
  // ROUTE_PERMISSIONS, which Dar and Finance both hold, so this guard is what
  // actually keeps them out.
  await requirePermission("label.print");
  const { id } = await params;
  const { ids, format: rawFormat } = await searchParams;
  const format = printFormatFrom(rawFormat);

  const selected = (ids ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const batch = await prisma.batch.findUnique({
    where: { id },
    select: { id: true, batchNumber: true, origin: true, permanent: true },
  });
  if (!batch) notFound();

  const cargo = await prisma.shipment.findMany({
    where: {
      batchId: batch.id,
      ...(selected.length > 0 ? { id: { in: selected } } : {}),
    },
    orderBy: { registeredAt: "desc" },
    include: {
      customer: { select: { name: true } },
      packageList: { orderBy: { sequence: "asc" } },
    },
  });

  // One sticker per physical package, not per shipment. Three shipments of two
  // cartons each is six labels, and each carries its own QR.
  const stickers: StickerData[] = await Promise.all(
    cargo.flatMap((item) =>
      item.packageList.map(async (pkg) => ({
        trackingNumber: item.trackingNumber,
        customerName: item.customer.name,
        description: item.description,
        packages: item.packageList.length,
        packagesLabel: formatPackages(item.packageList.length, item.packageType),
        weightLabel: formatWeight(item.weightKg),
        registeredOn: formatDate(item.registeredAt),
        sequence: pkg.sequence,
        packageRef: pkg.reference,
        qr: await packageQrDataUrl(pkg.qrToken, 700),
      }))
    )
  );

  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      <div className="no-print">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/app/batches/${batch.id}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to batch
          </Link>
        </Button>
        <p className="mt-1 text-sm text-muted-foreground">
          One sticker per package, for {cargo.length} shipment
          {cargo.length === 1 ? "" : "s"}
          {selected.length > 0 ? " selected" : " on this table"}.
        </p>
      </div>

      {stickers.length > 0 ? (
        <PrintFormatBar
          format={format}
          item={LABEL_MM}
          count={stickers.length}
          noun="sticker"
          printLabel={`Print ${stickers.length} sticker${stickers.length === 1 ? "" : "s"}`}
        />
      ) : null}

      {stickers.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="font-medium">Nothing to print</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Select cargo on the batch page, then come back.
          </p>
        </div>
      ) : (
        <div
          className={
            format === "sheet"
              ? "flex flex-wrap justify-center gap-4 print:gap-0"
              : "flex flex-col items-center gap-4 print:gap-0"
          }
        >
          {stickers.map((sticker) => (
            <CargoSticker key={sticker.packageRef} data={sticker} />
          ))}
        </div>
      )}
    </div>
  );
}
