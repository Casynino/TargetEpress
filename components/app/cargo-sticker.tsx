import Image from "next/image";

import { BrandMark } from "@/components/brand-mark";
import { COMPANY, ORIGIN_LABELS } from "@/lib/constants";

export type StickerData = {
  trackingNumber: string;
  customerName: string;
  customerPhone: string | null;
  customerCity: string | null;
  description: string;
  cargoTypeName: string | null;
  categoryLabel: string;
  packages: number;
  packagesLabel: string;
  weightLabel: string;
  origin: string;
  batchNumber: string | null;
  /** Pre-rendered QR as a data URL — generated on the server. */
  qr: string;
};

/**
 * The physical sticker that goes on the carton.
 *
 * Sized for a 4×6 thermal label. Everything on it is what a warehouse hand or a
 * customs officer needs while holding the box: the tracking number big enough to
 * read at arm's length, the consignee, and a QR that resolves the rest.
 *
 * `break-inside: avoid` matters more than it looks — printing forty of these,
 * a sticker split across a page boundary is a wasted label and a reprint.
 */
export function CargoSticker({ data }: { data: StickerData }) {
  return (
    <article className="sticker print-plain break-inside-avoid rounded-xl border-2 bg-white p-6 text-black">
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
          src={data.qr}
          alt={`QR code for ${data.trackingNumber}`}
          width={150}
          height={150}
          className="shrink-0 border border-black/20"
          unoptimized
        />

        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-black/60">
            Tracking number
          </p>
          <p className="font-mono text-2xl font-bold tabular">
            {data.trackingNumber}
          </p>

          <p className="mt-4 text-[10px] font-semibold uppercase tracking-widest text-black/60">
            Consignee
          </p>
          <p className="text-base font-bold leading-tight">{data.customerName}</p>
          <p className="font-mono text-sm tabular">
            {data.customerPhone ?? "Phone not recorded"}
          </p>
          {data.customerCity ? (
            <p className="text-sm">{data.customerCity}, Tanzania</p>
          ) : null}
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-4 gap-3 border-y border-black/20 py-4 text-center">
        {[
          { label: "Quantity", value: data.packagesLabel },
          { label: "Weight", value: data.weightLabel },
          {
            label: "Origin",
            value:
              ORIGIN_LABELS[data.origin as keyof typeof ORIGIN_LABELS] ?? data.origin,
          },
          { label: "Batch", value: data.batchNumber ?? "—" },
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
          {data.cargoTypeName ?? data.categoryLabel} — {data.description}
        </p>
      </div>
    </article>
  );
}
