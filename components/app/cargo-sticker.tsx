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
 * The sticker that goes on one box. 10 x 15cm, the courier standard.
 *
 * One per package, not per shipment: five cartons of clothes get five of
 * these, each with its own code, and the "3 / 5" in the corner is what tells
 * the Dar warehouse that four boxes on the floor is one box short of a
 * complete delivery.
 *
 * It used to print with no `@page` rule at all, so each label took a whole A4
 * sheet of adhesive stock, mostly blank. Now the page IS the label, on the
 * media every thermal roll in the trade is already cut to.
 *
 * Laid out down the card rather than across it. At 100mm wide there is room
 * for one column of information or a cramped two, and a courier label is read
 * top to bottom by somebody walking past a pallet: whose box it is, then the
 * code, then the details that settle an argument.
 *
 * Sized in millimetres and points throughout. A label is a physical object;
 * rems depend on a root font size that is a browser preference, and 58mm of QR
 * is 58mm of QR on any printer that is honest about its scaling.
 */
export function CargoSticker({ data }: { data: StickerData }) {
  return (
    <article
      className="sticker print-plain flex shrink-0 break-inside-avoid flex-col overflow-hidden border border-black/70 bg-white text-black"
      style={{
        width: `${LABEL_MM.width}mm`,
        height: `${LABEL_MM.height}mm`,
        padding: "4mm",
      }}
    >
      {/* Brand, and which box of how many — the two things read from across a
          loading bay before anyone picks the carton up. */}
      <header
        className="flex shrink-0 items-center justify-between border-b-2 border-black/70"
        style={{ paddingBottom: "2.2mm" }}
      >
        <div className="flex items-center" style={{ gap: "2mm" }}>
          <BrandMark tone="paper" style={{ height: "8.5mm", width: "auto" }} />
          <div className="leading-none">
            <p className="font-display font-bold" style={{ fontSize: "10pt" }}>
              TARGET EXPRESS
            </p>
            <p
              className="font-semibold uppercase"
              style={{ fontSize: "6pt", letterSpacing: "0.18em", marginTop: "0.8mm" }}
            >
              Air Cargo
            </p>
          </div>
        </div>
        <p
          className="font-display font-bold leading-none tabular"
          style={{ fontSize: "20pt" }}
        >
          {data.sequence}
          <span style={{ fontSize: "12pt" }}> / {data.packages}</span>
        </p>
      </header>

      <div className="shrink-0" style={{ paddingTop: "2.6mm" }}>
        <FieldLabel>Tracking number</FieldLabel>
        <p
          className="font-mono font-bold leading-none tabular"
          style={{ fontSize: "23pt", marginTop: "1mm" }}
        >
          {data.trackingNumber}
        </p>
        <p
          className="font-mono tabular text-black/70"
          style={{ fontSize: "8pt", marginTop: "1.2mm" }}
        >
          {data.packageRef}
        </p>
      </div>

      <div className="shrink-0" style={{ paddingTop: "2.6mm" }}>
        <FieldLabel>Consignee</FieldLabel>
        <p
          className="truncate font-bold leading-tight"
          style={{ fontSize: "13pt", marginTop: "0.8mm" }}
        >
          {data.customerName}
        </p>
      </div>

      {/*
        The code, centred and given the middle of the card.

        It is the only thing here a machine reads, and every other field exists
        to be legible when the machine is not to hand. At 58mm a 45-module code
        (37 data modules plus the four-module quiet zone each side) prints about
        1.3mm per module — well over double what a 203dpi thermal head needs,
        and enough to survive a scuffed, taped-over or rain-spotted carton.
      */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center"
        style={{ paddingTop: "2.4mm", paddingBottom: "2.4mm" }}
      >
        <Image
          src={data.qr}
          alt={`QR code for package ${data.packageRef}`}
          width={700}
          height={700}
          className="shrink-0"
          style={{ width: "58mm", height: "58mm" }}
          unoptimized
        />
      </div>

      <div className="shrink-0">
        <FieldLabel>Contents</FieldLabel>
        {/*
          Two lines and no more. A description runs to whatever the China desk
          typed; clamped, so a long one pushes nothing off the bottom of a card
          that has a fixed physical height and cannot grow.
        */}
        <p
          className="leading-snug"
          style={{
            fontSize: "8.5pt",
            marginTop: "0.8mm",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {data.description}
        </p>
      </div>

      <dl
        className="grid shrink-0 grid-cols-3 border-t-2 border-black/70"
        style={{ gap: "2mm", paddingTop: "2.2mm", marginTop: "2.4mm" }}
      >
        {[
          { label: "Weight", value: data.weightLabel },
          { label: "Quantity", value: data.packagesLabel },
          { label: "Registered", value: data.registeredOn },
        ].map((item) => (
          <div key={item.label} className="min-w-0">
            <dt
              className="font-semibold uppercase text-black/55"
              style={{ fontSize: "6pt", letterSpacing: "0.12em" }}
            >
              {item.label}
            </dt>
            <dd
              className="truncate font-mono font-bold tabular"
              style={{ fontSize: "9.5pt", marginTop: "0.6mm" }}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="font-semibold uppercase text-black/55"
      style={{ fontSize: "6pt", letterSpacing: "0.12em" }}
    >
      {children}
    </p>
  );
}
