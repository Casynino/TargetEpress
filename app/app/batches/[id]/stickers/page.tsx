import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { BackLinkButton } from "@/components/app/back-link-button";
import { CargoSticker, type StickerData } from "@/components/app/cargo-sticker";
import { PrintBar } from "@/components/app/print-bar";
import { formatPackages } from "@/lib/constants";
import { formatDate, formatWeight } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { LABEL_MM } from "@/lib/print";
import { packageQrDataUrl } from "@/lib/qr";
import { requirePermission } from "@/lib/session";
import { cargoText, viewerLocale } from "@/lib/viewer";

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
  // The whole-batch sticker sheet. Same rule as a single label: the desk that
  // packs the cargo prints for it. /app/batches resolves to batch.view in
  // ROUTE_PERMISSIONS, which Dar and Finance both hold, so this guard is what
  // actually keeps them out.
  await requirePermission("label.print");
  const locale = await viewerLocale();
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
        // The label carries the language of whoever printed it, same as the
        // single-cargo label and the PDF of this same selection. This handed
        // the sticker the stored text instead, so the one route that prints a
        // whole batch at once — the most used one in the warehouse — came out
        // in Chinese for a Dar bench while its own PDF came out in English.
        description: cargoText(locale, item, "description"),
        packages: item.packageList.length,
        packagesLabel: formatPackages(item.packageList.length, item.packageType, locale),
        weightLabel: formatWeight(item.weightKg),
        registeredOn: formatDate(item.registeredAt, locale),
        sequence: pkg.sequence,
        packageRef: pkg.reference,
        // 500px per code: this page can hold 150 of them, and each one is a
        // canvas render on the server before the page can answer at all.
        qr: await packageQrDataUrl(pkg.qrToken, 500),
      }))
    )
  );

  return (
    <div className="mx-auto max-w-3xl print:max-w-none">
      <div className="no-print">
        <BackLinkButton
          fallbackHref={`/app/batches/${batch.id}`}
          fallbackLabel="Back to batch"
        />
        <p className="mt-1 text-sm text-muted-foreground">
          One sticker per package, for {cargo.length} consignment
          {cargo.length === 1 ? "" : "s"}
          {selected.length > 0 ? " selected" : " on this table"}.
        </p>
      </div>

      {stickers.length > 0 ? (
        <PrintBar
          item={LABEL_MM}
          printLabel={`Print ${stickers.length} sticker${stickers.length === 1 ? "" : "s"}`}
          downloadHref={`/app/batches/${batch.id}/stickers/pdf${
            selected.length > 0 ? `?ids=${selected.join(",")}` : ""
          }`}
          hint={t(locale, "One code per box — never copy a label onto two.")}
        />
      ) : null}

      {stickers.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <p className="font-medium">{t(locale, "Nothing to print")}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(locale, "Select cargo on the batch page, then come back.")}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4 print:gap-0">
          {stickers.map((sticker) => (
            <CargoSticker key={sticker.packageRef} data={sticker} />
          ))}
        </div>
      )}
    </div>
  );
}
