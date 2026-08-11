import Image from "next/image";

import { BrandMark } from "@/components/brand-mark";
import { COMPANY } from "@/lib/constants";
import { SLIP_MM } from "@/lib/print";

export type PickupSlipData = {
  /** The pickup code the customer quotes and the counter scans: PN-2026-000123. */
  noteNumber: string;
  status: string;
  issuedOn: string;
  trackingNumber: string;
  customerName: string;
  customerPhone: string | null;
  description: string;
  weightLabel: string;
  packagesLabel: string;
  invoiceNumber: string | null;
  /** "Paid in full", already worded — the slip states a fact, not a figure. */
  paymentStatus: string;
  amountLabel: string | null;
  /** Pre-rendered QR as a data URL, generated on the server. */
  qr: string;
};

const OFFICE = COMPANY.offices[0];

/**
 * The slip a customer carries to the warehouse. 10 x 15cm, the same card as
 * the cargo labels.
 *
 * This was an A4 document with signature rules, a payment ledger and a
 * paragraph of terms: a page of office stationery handed to somebody who is
 * going to fold it into a pocket, carry it across Kariakoo and hold it out at
 * a counter.
 *
 * It shares the label's media deliberately. A warehouse that stocks one size
 * of card and prints everything on it never loads the wrong roll, and the slip
 * in the customer's hand is then physically the same object as the sticker on
 * their box — which matters, because the counter scans both and they have to
 * agree.
 *
 * What did not survive the cut is the payment breakdown and the two signature
 * lines: the release is captured on a phone with a photograph now, so a
 * signature on paper recorded nothing the system did not already hold better.
 */
export function PickupSlip({ data }: { data: PickupSlipData }) {
  const spent = data.status !== "ACTIVE";

  return (
    <article
      className="sticker print-plain relative flex shrink-0 break-inside-avoid flex-col overflow-hidden border border-black/70 bg-white text-black"
      style={{
        width: `${SLIP_MM.width}mm`,
        height: `${SLIP_MM.height}mm`,
        padding: "4mm",
      }}
    >
      {/* The brand rule, in the proportion the registered mark uses its inks. */}
      <span aria-hidden className="absolute inset-x-0 top-0 bg-[#182A48]" style={{ height: "1.6mm" }} />
      <span aria-hidden className="absolute left-0 top-0 bg-[#D81E2A]" style={{ height: "1.6mm", width: "26mm" }} />

      <header
        className="flex shrink-0 items-start justify-between border-b-2 border-black/70"
        style={{ paddingTop: "1.8mm", paddingBottom: "2.2mm", gap: "2mm" }}
      >
        <div className="flex items-center" style={{ gap: "2mm" }}>
          <BrandMark tone="paper" style={{ height: "8.5mm", width: "auto" }} />
          <div className="leading-none">
            <p className="font-display font-bold" style={{ fontSize: "10pt" }}>
              TARGET EXPRESS
            </p>
            <p
              className="font-semibold uppercase text-black/60"
              style={{ fontSize: "6pt", letterSpacing: "0.18em", marginTop: "0.8mm" }}
            >
              Pickup note
            </p>
          </div>
        </div>
        <div className="text-right leading-none">
          {/*
            The issue date always, and the status as well as it — not instead.

            These were one slot, so a collected or cancelled note printed
            "Collected" where the date had been and carried no issue date
            anywhere. That is the field somebody reaches for weeks later when a
            storage charge is disputed, and the one state where the slip gets
            argued over is exactly the state that dropped it.
          */}
          <p
            className="font-semibold uppercase text-black/55"
            style={{ fontSize: "6pt", letterSpacing: "0.14em" }}
          >
            Issued
          </p>
          <p className="font-mono font-bold tabular" style={{ fontSize: "9.5pt", marginTop: "1mm" }}>
            {data.issuedOn}
          </p>
          {spent ? (
            <p
              className="font-display font-bold uppercase"
              style={{
                fontSize: "9pt",
                marginTop: "1.2mm",
                color: data.status === "USED" ? "#117447" : "#D81E2A",
              }}
            >
              {data.status === "USED" ? "Collected" : "Cancelled"}
            </p>
          ) : null}
        </div>
      </header>

      {/*
        The code, centred and given the middle of the card — the same shape the
        cargo label uses, so a clerk scanning one after the other aims at the
        same place twice.
      */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center"
        style={{ paddingTop: "2.2mm", paddingBottom: "2mm" }}
      >
        {/*
          Sized by the space left rather than by a number typed here.

          A fixed 54mm square in a `shrink-0` image overflowed this row and
          painted straight over the header and the tracking number — a flex
          item that cannot shrink does not politely get smaller, it spills. The
          height comes from the row, the width follows the square, and the cap
          stops it ballooning on a slip whose text happens to be short.
        */}
        <Image
          src={data.qr}
          alt={`Pickup QR for ${data.trackingNumber}`}
          width={640}
          height={640}
          style={{
            height: "100%",
            width: "auto",
            maxHeight: "46mm",
            aspectRatio: "1 / 1",
          }}
          unoptimized
        />
      </div>

      {/* The two numbers a person is asked for at the counter. */}
      <div className="flex shrink-0 items-end justify-between" style={{ gap: "3mm" }}>
        <div className="min-w-0">
          <FieldLabel>Tracking number</FieldLabel>
          <p
            className="font-mono font-bold leading-none tabular"
            style={{ fontSize: "15pt", marginTop: "0.8mm" }}
          >
            {data.trackingNumber}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <FieldLabel>Pickup code</FieldLabel>
          <p
            className="font-mono font-bold leading-none tabular"
            style={{ fontSize: "10pt", marginTop: "0.8mm" }}
          >
            {data.noteNumber}
          </p>
        </div>
      </div>

      <div
        className="flex shrink-0 items-baseline justify-between"
        style={{ marginTop: "1.8mm", gap: "3mm" }}
      >
        <p className="truncate font-bold leading-tight" style={{ fontSize: "11pt" }}>
          {data.customerName}
        </p>
        <p className="shrink-0 font-mono tabular text-black/70" style={{ fontSize: "8pt" }}>
          {data.customerPhone ?? "No phone"}
        </p>
      </div>

      <div className="shrink-0" style={{ marginTop: "1.8mm" }}>
        <FieldLabel>Cargo</FieldLabel>
        <p
          className="leading-snug"
          style={{
            fontSize: "8.5pt",
            marginTop: "0.6mm",
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
        className="grid shrink-0 grid-cols-3 border-y border-black/30"
        style={{ gap: "2mm", marginTop: "1.8mm", paddingTop: "1.6mm", paddingBottom: "1.6mm" }}
      >
        {[
          { label: "Weight", value: data.weightLabel },
          { label: "Quantity", value: data.packagesLabel },
          { label: "Invoice", value: data.invoiceNumber ?? "—" },
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
              style={{ fontSize: "9pt", marginTop: "0.5mm" }}
            >
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Paid or not — the question the counter asks before anything moves. */}
      <div
        className="flex shrink-0 items-baseline justify-between"
        style={{
          gap: "2mm",
          marginTop: "1.8mm",
          padding: "1.6mm 2.6mm",
          backgroundColor: "rgba(17,116,71,0.12)",
        }}
      >
        <p
          className="font-display font-bold uppercase leading-none"
          style={{ fontSize: "10.5pt", color: "#117447", letterSpacing: "0.04em" }}
        >
          {data.paymentStatus}
        </p>
        {data.amountLabel ? (
          <p className="font-mono font-bold tabular" style={{ fontSize: "10pt", color: "#117447" }}>
            {data.amountLabel}
          </p>
        ) : null}
      </div>

      {/* Where to come. The one office, in the owner's own wording. */}
      <div className="shrink-0" style={{ marginTop: "1.8mm" }}>
        <FieldLabel>Collect from</FieldLabel>
        {OFFICE.lines.map((line) => (
          <p key={line} className="leading-snug" style={{ fontSize: "7.5pt" }}>
            {line}
          </p>
        ))}
      </div>

      <footer
        className="shrink-0 border-t border-black/30"
        style={{ paddingTop: "2mm", marginTop: "1.8mm" }}
      >
        <p className="leading-snug text-black/70" style={{ fontSize: "6.8pt" }}>
          Valid once. Anyone collecting for you brings their own ID.
        </p>
        <p
          className="font-mono tabular text-black/80"
          style={{ fontSize: "7pt", marginTop: "1mm" }}
        >
          {COMPANY.phone} · {COMPANY.phoneAlt} · {COMPANY.email}
        </p>
      </footer>
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
