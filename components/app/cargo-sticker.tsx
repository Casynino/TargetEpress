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
  /** This package's position in the shipment — the "1" in "1 of 5". */
  sequence: number;
  /** Printed under the tracking number: TX-2026-00125-P1. */
  packageRef: string;
  /** Pre-rendered QR as a data URL — generated on the server. */
  qr: string;
};

/**
 * The physical sticker that goes on one box.
 *
 * One sticker per package, not per shipment. Five cartons of clothes get five
 * of these, each with its own QR, and the "1 of 5" in the corner is what tells
 * the Dar warehouse that four boxes on the floor is four boxes short of a
 * complete delivery.
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
          <BrandMark tone="paper" className="h-9 w-auto" />
          <div>
            <p className="font-display text-lg font-bold leading-none">
              TARGET EXPRESS
            </p>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em]">
              Air Cargo
            </p>
          </div>
        </div>
        <div className="text-right">
          {/* Read from across the room: which box of how many. */}
          <p className="font-display text-2xl font-bold leading-none tabular">
            {data.sequence} <span className="text-base font-semibold">of</span>{" "}
            {data.packages}
          </p>
          <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-black/60">
            {data.packagesLabel}
          </p>
        </div>
      </header>

      <div className="mt-5 flex gap-5">
        <Image
          src={data.qr}
          alt={`QR code for package ${data.packageRef}`}
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
          <p className="font-mono text-xs font-semibold tabular text-black/70">
            {data.packageRef}
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
          { label: "This package", value: `${data.sequence} / ${data.packages}` },
          { label: "Shipment weight", value: data.weightLabel },
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

      <footer className="mt-4 flex items-end justify-between gap-3 border-t border-black/20 pt-3 text-[9px] leading-snug">
        <p className="max-w-[65%] text-black/70">
          Do not remove this label. Cargo is released only against a valid pickup
          note, and only when every package has arrived.
        </p>
        <p className="shrink-0 text-right text-black/70">
          {COMPANY.phone}
          <br />
          {COMPANY.email}
        </p>
      </footer>
    </article>
  );
}
