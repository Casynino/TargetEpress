import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { PrintButton } from "@/components/app/print-button";
import { Button } from "@/components/ui/button";
import { COMPANY, GOODS_TYPE_LABELS, ORIGIN_LABELS } from "@/lib/constants";
import { formatDate, formatWeight } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { shipmentQrDataUrl } from "@/lib/qr";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Cargo label" };

export default async function LabelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("shipment.view");
  const { id } = await params;
  const key = decodeURIComponent(id);

  const shipment = await prisma.shipment.findUnique({
    where: key.startsWith("TX-") ? { trackingNumber: key.toUpperCase() } : { id: key },
    include: { customer: true, batch: true },
  });

  if (!shipment) notFound();

  const qr = await shipmentQrDataUrl(shipment.qrToken, 320);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-6 flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/app/shipments/${shipment.trackingNumber}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to shipment
          </Link>
        </Button>
        <PrintButton label="Print label" />
      </div>

      {/* The physical label. Sized for a 4×6 thermal sticker or an A5 sheet. */}
      <article className="print-plain rounded-xl border-2 bg-white p-6 text-black shadow-soft">
        <header className="flex items-start justify-between border-b-2 border-black/80 pb-4">
          <div className="flex items-center gap-2">
            <BrandMark className="h-9 w-9" />
            <div>
              <p className="font-display text-lg font-bold leading-none">
                TARGET EXPRESS
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em]">
                Air Cargo
              </p>
            </div>
          </div>
          <div className="text-right text-[10px] leading-relaxed">
            <p>{COMPANY.phone}</p>
            <p>{COMPANY.email}</p>
          </div>
        </header>

        <div className="mt-5 flex gap-5">
          <Image
            src={qr}
            alt={`QR code for ${shipment.trackingNumber}`}
            width={170}
            height={170}
            className="shrink-0 border border-black/20"
            unoptimized
          />

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-black/60">
              Tracking number
            </p>
            <p className="font-mono text-2xl font-bold tabular">
              {shipment.trackingNumber}
            </p>

            <p className="mt-4 text-[10px] font-semibold uppercase tracking-widest text-black/60">
              Consignee
            </p>
            <p className="text-base font-bold leading-tight">
              {shipment.customer.name}
            </p>
            <p className="font-mono text-sm tabular">{shipment.customer.phone}</p>
            {shipment.customer.city ? (
              <p className="text-sm">{shipment.customer.city}, Tanzania</p>
            ) : null}
          </div>
        </div>

        <dl className="mt-5 grid grid-cols-4 gap-3 border-y border-black/20 py-4 text-center">
          {[
            { label: "Packages", value: String(shipment.packages) },
            { label: "Weight", value: formatWeight(shipment.weightKg) },
            { label: "Origin", value: ORIGIN_LABELS[shipment.origin] },
            { label: "Batch", value: shipment.batch?.batchNumber ?? "—" },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-[9px] font-semibold uppercase tracking-widest text-black/60">
                {item.label}
              </dt>
              <dd className="mt-0.5 font-mono text-xs font-bold tabular">
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-black/60">
            Contents
          </p>
          <p className="text-sm font-medium">
            {GOODS_TYPE_LABELS[shipment.goodsType]} — {shipment.description}
          </p>
        </div>

        <footer className="mt-5 flex items-end justify-between border-t border-black/20 pt-3">
          <p className="max-w-[70%] text-[9px] leading-snug text-black/70">
            Do not remove this label. Cargo is released only against a valid
            pickup note. Track at {COMPANY.email.split("@")[1]}/track
          </p>
          <p className="font-mono text-[10px] tabular">
            {formatDate(shipment.registeredAt)}
          </p>
        </footer>
      </article>

      <p className="no-print mt-4 text-center text-xs text-muted-foreground">
        Print at 100% scale and attach to the largest package. For multi-package
        shipments, print one label per package.
      </p>
    </div>
  );
}
