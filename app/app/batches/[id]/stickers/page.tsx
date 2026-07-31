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
import { prisma } from "@/lib/prisma";
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
  searchParams: Promise<{ ids?: string }>;
}) {
  await requirePermission("shipment.view");
  const { id } = await params;
  const { ids } = await searchParams;

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
    orderBy: { trackingNumber: "asc" },
    include: {
      customer: { select: { name: true, phone: true, city: true } },
      cargoType: { select: { name: true } },
      batch: { select: { batchNumber: true } },
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
        customerPhone: item.customer.phone,
        customerCity: item.customer.city,
        description: item.description,
        cargoTypeName: item.cargoType?.name ?? null,
        categoryLabel: CATEGORY_LABELS[item.cargoCategory],
        packages: item.packageList.length,
        packagesLabel: formatPackages(item.packageList.length, item.packageType),
        weightLabel: formatWeight(item.weightKg),
        origin: item.origin,
        batchNumber: item.batch?.batchNumber ?? null,
        sequence: pkg.sequence,
        packageRef: pkg.reference,
        qr: await packageQrDataUrl(pkg.qrToken, 150),
      }))
    )
  );

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm">
            <Link href={`/app/batches/${batch.id}`}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to batch
            </Link>
          </Button>
          <p className="mt-1 text-sm text-muted-foreground">
            {stickers.length} sticker{stickers.length === 1 ? "" : "s"} — one per
            package, for {cargo.length} shipment{cargo.length === 1 ? "" : "s"}
            {selected.length > 0 ? " selected" : " on this table"}
          </p>
        </div>
        <PrintButton label={`Print ${stickers.length} sticker${stickers.length === 1 ? "" : "s"}`} />
      </div>

      {stickers.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="font-medium">Nothing to print</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Select cargo on the batch page, then come back.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {stickers.map((sticker) => (
            <CargoSticker key={sticker.packageRef} data={sticker} />
          ))}
        </div>
      )}
    </div>
  );
}
