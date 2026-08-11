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
 * The slip a customer carries to the warehouse. 100 x 128mm — pocket-sized.
 *
 * This was an A4 document with signature rules, a payment ledger and a
 * paragraph of terms: a page of office stationery handed to somebody who is
 * going to fold it into a pocket, carry it across Kariakoo and hold it out at
 * a counter. Four of these now fit the sheet that carried one.
 *
 * What survived the cut is what the counter or the customer actually uses:
 * the code that opens the cargo, the numbers they will be asked for, what the
 * box is, whether it is paid, and where to come. The payment breakdown and the
 * two signature lines went — the release is captured on a phone with a
 * photograph, so a signature on paper recorded nothing the system did not
 * already hold better.
 */
export function PickupSlip({ data }: { data: PickupSlipData }) {
  const spent = data.status !== "ACTIVE";

  return (
    <article
      className="sticker print-plain shrink-0 relative flex break-inside-avoid flex-col overflow-hidden border border-black/70 bg-white text-black"
      style={{
        width: `${SLIP_MM.width}mm`,
        height: `${SLIP_MM.height}mm`,
        padding: "4mm",
      }}
    >
      {/* The brand rule, in the proportion the registered mark uses its inks. */}
      <span aria-hidden className="absolute inset-x-0 top-0 bg-[#182A48]" style={{ height: "1.4mm" }} />
      <span aria-hidden className="absolute left-0 top-0 bg-[#D81E2A]" style={{ height: "1.4mm", width: "26mm" }} />

      <header
        className="flex shrink-0 items-start justify-between border-b border-black/60"
        style={{ paddingTop: "1.6mm", paddingBottom: "2mm", gap: "2mm" }}
      >
        <div className="flex items-center" style={{ gap: "1.8mm" }}>
          <BrandMark tone="paper" style={{ height: "7.5mm", width: "auto" }} />
          <div className="leading-none">
            <p className="font-display font-bold" style={{ fontSize: "8.5pt" }}>
              TARGET EXPRESS
            </p>
            <p
              className="font-semibold uppercase text-black/60"
              style={{ fontSize: "5.5pt", letterSpacing: "0.18em", marginTop: "0.6mm" }}
            >
              Air Cargo
            </p>
          </div>
        </div>
        <div className="text-right leading-none">
          {/*
            The issue date always, and the status as well as it — not instead.

            These were one slot, so a collected or cancelled note printed
            "Collected" where the date had been and carried no issue date
            anywhere. That is the field somebody reaches for weeks later when a
            storage charge is disputed, and the one state where the slip is
            being argued over is exactly the state that dropped it.
          */}
          {/*
            The status shares the label's line rather than taking one of its
            own. Stacked, it grew the header by about four millimetres and
            pushed the footer off a slip whose height is fixed — a spent note
            printed short of its own contact details.
          */}
          <p
            className="flex items-baseline justify-end gap-1.5 font-semibold uppercase text-black/55"
            style={{ fontSize: "5.5pt", letterSpacing: "0.16em" }}
          >
            {spent ? (
              <span
                className="font-display font-bold"
                style={{
                  fontSize: "7.5pt",
                  letterSpacing: "0.04em",
                  color: data.status === "USED" ? "#117447" : "#D81E2A",
                }}
              >
                {data.status === "USED" ? "Collected" : "Cancelled"}
              </span>
            ) : null}
            <span>Issued</span>
          </p>
          <p className="font-mono font-bold tabular" style={{ fontSize: "8pt", marginTop: "1mm" }}>
            {data.issuedOn}
          </p>
        </div>
      </header>

      {/* The code, and the two numbers a person is asked for at the counter. */}
      <div className="flex shrink-0 items-center" style={{ gap: "3mm", paddingTop: "2.5mm" }}>
        <Image
          src={data.qr}
          alt={`Pickup QR for ${data.trackingNumber}`}
          width={320}
          height={320}
          className="shrink-0"
          /*
            42mm, not 44. A collected or cancelled note carries a status word
            the header of a live one does not, and at 44 that extra millimetre
            tipped the slip half a millimetre past its own height and shaved the
            footer. Two millimetres back here buys slack in every state; a
            37-module code still prints at 0.93mm per module, which is twice
            what a scanner needs.
          */
          style={{ width: "42mm", height: "42mm" }}
          unoptimized
        />
        <div className="min-w-0 flex-1">
          <Field label="Tracking number">
            <p className="font-mono font-bold leading-none tabular" style={{ fontSize: "13pt" }}>
              {data.trackingNumber}
            </p>
          </Field>
          <div style={{ marginTop: "2.4mm" }}>
            <Field label="Pickup code">
              <p className="font-mono font-bold leading-none tabular" style={{ fontSize: "10pt" }}>
                {data.noteNumber}
              </p>
            </Field>
          </div>
          <div style={{ marginTop: "2.4mm" }}>
            <Field label="Customer">
              <p className="truncate font-bold leading-tight" style={{ fontSize: "9pt" }}>
                {data.customerName}
              </p>
              <p className="font-mono tabular text-black/70" style={{ fontSize: "6.5pt" }}>
                {data.customerPhone ?? "No phone recorded"}
              </p>
            </Field>
          </div>
        </div>
      </div>

      {/* What the box is. */}
      <div style={{ marginTop: "2.5mm" }}>
        <Field label="Cargo">
          <p
            className="leading-snug"
            style={{
              fontSize: "7.5pt",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {data.description}
          </p>
        </Field>
      </div>

      <dl
        className="grid shrink-0 grid-cols-3 border-y border-black/25"
        style={{ gap: "2mm", marginTop: "2.5mm", paddingTop: "1.8mm", paddingBottom: "1.8mm" }}
      >
        {[
          { label: "Weight", value: data.weightLabel },
          { label: "Quantity", value: data.packagesLabel },
          { label: "Invoice", value: data.invoiceNumber ?? "—" },
        ].map((item) => (
          <div key={item.label} className="min-w-0">
            <dt
              className="font-semibold uppercase text-black/55"
              style={{ fontSize: "5.5pt", letterSpacing: "0.14em" }}
            >
              {item.label}
            </dt>
            <dd className="truncate font-mono font-bold tabular" style={{ fontSize: "7.5pt", marginTop: "0.4mm" }}>
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
          marginTop: "2.5mm",
          padding: "1.8mm 2.4mm",
          backgroundColor: "rgba(17,116,71,0.12)",
        }}
      >
        <p
          className="font-display font-bold uppercase leading-none"
          style={{ fontSize: "9pt", color: "#117447", letterSpacing: "0.04em" }}
        >
          {data.paymentStatus}
        </p>
        {data.amountLabel ? (
          <p className="font-mono font-bold tabular" style={{ fontSize: "9pt", color: "#117447" }}>
            {data.amountLabel}
          </p>
        ) : null}
      </div>

      {/* Where to come. The one office, in the owner's own wording. */}
      <div style={{ marginTop: "2.5mm" }}>
        <Field label="Collect from">
          {OFFICE.lines.map((line) => (
            <p key={line} className="leading-snug" style={{ fontSize: "6.8pt" }}>
              {line}
            </p>
          ))}
        </Field>
      </div>

      <footer
        className="mt-auto shrink-0 border-t border-black/25"
        style={{ paddingTop: "1.8mm" }}
      >
        <p className="leading-snug text-black/70" style={{ fontSize: "5.8pt" }}>
          Bring this slip. Staff scan it and the code on your cargo — both must
          match. Valid once. Anyone collecting for you must bring their own ID.
        </p>
        <p
          className="font-mono tabular text-black/80"
          style={{ fontSize: "6.2pt", marginTop: "1.2mm" }}
        >
          {COMPANY.phone} · {COMPANY.phoneAlt} · {COMPANY.email}
        </p>
      </footer>
    </article>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    // A plain paragraph, not <dt>: this is not inside a <dl>, and a definition
    // term outside a definition list is markup that only looks like structure.
    <div className="min-w-0">
      <p
        className="font-semibold uppercase text-black/55"
        style={{ fontSize: "5.5pt", letterSpacing: "0.14em", marginBottom: "0.5mm" }}
      >
        {label}
      </p>
      <div>{children}</div>
    </div>
  );
}
