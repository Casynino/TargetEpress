import Image from "next/image";

import { BrandMark } from "@/components/brand-mark";
import { LABEL_MM } from "@/lib/print";

export type StickerData = {
  trackingNumber: string;
  customerName: string;
  description: string;
  packages: number;
  /** "3 cartons" — the count with its unit, never a bare number. */
  packagesLabel: string;
  weightLabel: string;
  /** This package's position in the shipment — the "1" in "1 of 5". */
  sequence: number;
  /** Printed under the tracking number: TX-000125-P1. */
  packageRef: string;
  /** When the box was booked in at the China counter, already formatted. */
  registeredOn: string;
  /** Pre-rendered QR as a data URL — generated on the server. */
  qr: string;
};

/**
 * The sticker that goes on one box. 100 x 70mm, and it means it.
 *
 * One per package, not per shipment: five cartons of clothes get five of
 * these, each with its own code, and the "3 / 5" in the corner is what tells
 * the Dar warehouse that four boxes on the floor is one box short of a
 * complete delivery.
 *
 * It used to be laid out for a 4x6 thermal label and printed with no `@page`
 * rule at all, so each one took a whole A4 sheet of adhesive stock — mostly
 * blank. Eight now fit that sheet. What went is what a person holding the box
 * does not read off it: the origin airport, the batch number, the cargo
 * category and a paragraph of terms. All of it is one scan away, which is the
 * entire point of the code taking up a third of the sticker.
 *
 * Field names are 5.5pt rather than the 4.5pt this started at: about two
 * millimetres of cap height, which is the floor for something read at arm's
 * length in a warehouse rather than held up to a desk lamp.
 *
 * Sized in millimetres throughout. A label is a physical object; rems depend
 * on a root font size that is a browser preference, and 42mm of QR is 42mm of
 * QR on any printer that is honest about its scaling.
 */
export function CargoSticker({ data }: { data: StickerData }) {
  return (
    <article
      className="sticker print-plain shrink-0 flex break-inside-avoid flex-col overflow-hidden border border-black/70 bg-white text-black"
      style={{
        width: `${LABEL_MM.width}mm`,
        height: `${LABEL_MM.height}mm`,
        padding: "3mm",
      }}
    >
      {/* Brand, and which box of how many — the two things read from across a
          loading bay before anyone picks the carton up. */}
      <header
        className="flex shrink-0 items-center justify-between border-b border-black/60"
        style={{ paddingBottom: "1.6mm" }}
      >
        <div className="flex items-center" style={{ gap: "1.6mm" }}>
          <BrandMark tone="paper" style={{ height: "6.5mm", width: "auto" }} />
          <div className="leading-none">
            <p className="font-display font-bold" style={{ fontSize: "8pt" }}>
              TARGET EXPRESS
            </p>
            <p
              className="font-semibold uppercase"
              style={{ fontSize: "5.5pt", letterSpacing: "0.18em", marginTop: "0.6mm" }}
            >
              Air Cargo
            </p>
          </div>
        </div>
        <p
          className="font-display font-bold leading-none tabular"
          style={{ fontSize: "15pt" }}
        >
          {data.sequence}
          <span style={{ fontSize: "9pt" }}> / {data.packages}</span>
        </p>
      </header>

      <div className="flex min-h-0 flex-1 items-stretch" style={{ gap: "3mm", paddingTop: "2mm" }}>
        {/*
          The code, given the room it needs.

          This is the only thing on the sticker a machine reads, and every
          other field exists to be legible when the machine is not to hand — so
          it takes the full height the rest of the label leaves rather than
          sitting in a box with dead sticker underneath it. At 42mm a ~37-module
          code prints better than a millimetre per module, which reads off a
          phone camera at arm's length and survives a scuffed carton.
        */}
        <Image
          src={data.qr}
          alt={`QR code for package ${data.packageRef}`}
          width={300}
          height={300}
          className="shrink-0 self-start"
          style={{ width: "42mm", height: "42mm" }}
          unoptimized
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <p
            className="font-mono font-bold leading-none tabular"
            style={{ fontSize: "14.5pt" }}
          >
            {data.trackingNumber}
          </p>
          <p
            className="font-mono tabular text-black/70"
            style={{ fontSize: "6.5pt", marginTop: "0.8mm" }}
          >
            {data.packageRef}
          </p>

          <p
            className="truncate font-bold leading-tight"
            style={{ fontSize: "9.5pt", marginTop: "2.2mm" }}
          >
            {data.customerName}
          </p>

          {/*
            Two lines of contents and no more.

            A description runs to whatever the China desk typed. Clamped, so a
            long one pushes nothing off the bottom of a sticker that has a
            fixed physical height and cannot grow.
          */}
          <p
            className="leading-snug"
            style={{
              fontSize: "7pt",
              marginTop: "1.2mm",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {data.description}
          </p>
        </div>
      </div>

      <dl
        className="grid shrink-0 grid-cols-3 border-t border-black/60"
        style={{ gap: "2mm", paddingTop: "1.6mm", marginTop: "1.6mm" }}
      >
        {[
          { label: "Weight", value: data.weightLabel },
          { label: "Quantity", value: data.packagesLabel },
          { label: "Registered", value: data.registeredOn },
        ].map((item) => (
          <div key={item.label} className="min-w-0">
            <dt
              className="font-semibold uppercase text-black/55"
              style={{ fontSize: "5.5pt", letterSpacing: "0.14em" }}
            >
              {item.label}
            </dt>
            <dd
              className="truncate font-mono font-bold tabular"
              style={{ fontSize: "7.5pt", marginTop: "0.4mm" }}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
