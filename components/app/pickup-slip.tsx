import Image from "next/image";

import { BrandMark } from "@/components/brand-mark";
import { COMPANY } from "@/lib/constants";
import { t } from "@/lib/i18n";
import { SLIP_MM } from "@/lib/print";
import { viewerLocale } from "@/lib/viewer";

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
  /**
   * Set when this cargo left on credit and the bill is not settled.
   *
   * Its presence is what turns the payment block from the green settled
   * treatment to the warning one; the words and the figure still come from
   * `paymentStatus` and `amountLabel` above, so the block keeps one shape and
   * the page keeps one place to word it from. A written-off bill arrives here
   * with no date and no figure: nothing is owed and nobody is chasing it, but it
   * was never paid either, so it must not print green.
   */
  credit: {
    /**
     * The day the money falls due, spelled out.
     *
     * A date and not "due in 12 days". This card goes into a pocket and comes
     * back out weeks later, and a countdown printed on paper is wrong by the
     * next morning — the countdown belongs on the screen, which can recount it.
     */
    dueOn: string | null;
    /** Already late at the moment of printing. */
    overdue: boolean;
    /** The same amount in dollars, when the bill was converted at all. */
    amountUsd: string | null;
  } | null;
  /**
   * One line, and only when storage actually applied.
   *
   * The payment breakdown was cut from this card on purpose and is not coming
   * back — but storage is the one charge a customer argues about at the
   * counter, because it is the only one that grew while they were not looking.
   * So the slip records what it was, or that it was forgiven, and stays silent
   * on the majority of consignments where the clock never ran.
   */
  storageLabel: string | null;
  /** True when the storage figure above was waived rather than charged. */
  storageWaived: boolean;
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
export async function PickupSlip({ data }: { data: PickupSlipData }) {
  const locale = await viewerLocale();
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
              {t(locale, "Pickup note")}
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
            {t(locale, "Issued")}
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
              {data.status === "USED"
                ? t(locale, "Collected")
                : t(locale, "Cancelled")}
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
          alt={`${t(locale, "Pickup QR for")} ${data.trackingNumber}`}
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
          <FieldLabel>{t(locale, "Tracking number")}</FieldLabel>
          <p
            className="font-mono font-bold leading-none tabular"
            style={{ fontSize: "15pt", marginTop: "0.8mm" }}
          >
            {data.trackingNumber}
          </p>
        </div>
        <div className="min-w-0 text-right">
          <FieldLabel>{t(locale, "Pickup code")}</FieldLabel>
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
          {data.customerPhone ?? t(locale, "No phone")}
        </p>
      </div>

      <div className="shrink-0" style={{ marginTop: "1.8mm" }}>
        <FieldLabel>{t(locale, "Cargo")}</FieldLabel>
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
          { label: t(locale, "Weight"), value: data.weightLabel },
          { label: t(locale, "Quantity"), value: data.packagesLabel },
          { label: t(locale, "Invoice"), value: data.invoiceNumber ?? "—" },
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

      {/*
        Paid or not — the question the counter asks before anything moves.

        This was green and said "Paid in full" on every note printed, because
        issuing one used to mean the money had arrived. Credit releases cargo
        against an open bill, so the same card would have handed the customer a
        receipt for money they still owe — "do not make the customer think the
        invoice has been paid", in the owner's words. On credit the block moves
        to the warning end of the palette and carries the day it falls due.

        The colour is not what carries it. These print on whatever roll the
        warehouse loaded and half of those are monochrome, so the words say it,
        the figure beside them is what is STILL OWED rather than what was paid,
        and the box is ruled so the block reads as a stamp in black and white.
      */}
      <div
        className="shrink-0"
        style={{
          marginTop: "1.8mm",
          padding: "1.6mm 2.6mm",
          backgroundColor: data.credit
            ? "rgba(216,30,42,0.12)"
            : "rgba(17,116,71,0.12)",
          border: data.credit ? "0.3mm solid rgba(176,23,34,0.5)" : undefined,
        }}
      >
        <div className="flex items-baseline justify-between" style={{ gap: "2mm" }}>
          <p
            className="font-display font-bold uppercase leading-none"
            style={{
              fontSize: "10.5pt",
              color: data.credit ? "#B01722" : "#117447",
              letterSpacing: "0.04em",
            }}
          >
            {data.paymentStatus}
          </p>
          {data.amountLabel ? (
            <p
              className="font-mono font-bold leading-none tabular"
              style={{ fontSize: "10pt", color: data.credit ? "#B01722" : "#117447" }}
            >
              {data.amountLabel}
            </p>
          ) : null}
        </div>

        {/* The due date, on the same block rather than a row of its own — one
            line, and only the credit that actually has a date to give. */}
        {data.credit && (data.credit.dueOn || data.credit.amountUsd) ? (
          <div
            className="flex items-baseline justify-between"
            style={{ gap: "2mm", marginTop: "1.3mm" }}
          >
            <p
              className="min-w-0 truncate font-semibold uppercase leading-none"
              style={{ fontSize: "7pt", letterSpacing: "0.1em", color: "#B01722" }}
            >
              {data.credit.dueOn ? (
                <>
                  {t(locale, "Payment due")}{" "}
                  <span className="font-mono tabular">{data.credit.dueOn}</span>
                </>
              ) : null}
              {data.credit.amountUsd ? (
                <>
                  {data.credit.dueOn ? " · " : null}
                  <span className="font-mono tabular">{data.credit.amountUsd}</span>
                </>
              ) : null}
            </p>
            {data.credit.overdue ? (
              <p
                className="shrink-0 font-display font-bold uppercase leading-none"
                style={{ fontSize: "7.5pt", letterSpacing: "0.1em", color: "#B01722" }}
              >
                {t(locale, "Overdue")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      {data.storageLabel ? (
        <div
          className="flex shrink-0 items-baseline justify-between"
          style={{
            gap: "2mm",
            marginTop: "1.2mm",
            padding: "1.2mm 2.6mm",
            backgroundColor: data.storageWaived
              ? "rgba(176,120,10,0.12)"
              : "rgba(216,30,42,0.10)",
          }}
        >
          <p
            className="font-semibold uppercase leading-none"
            style={{
              fontSize: "7pt",
              letterSpacing: "0.12em",
              color: data.storageWaived ? "#8A5D08" : "#B01722",
            }}
          >
            {data.storageWaived
              ? t(locale, "Storage waived")
              : t(locale, "Storage included")}
          </p>
          <p
            className="font-mono font-bold tabular"
            style={{
              fontSize: "8.5pt",
              color: data.storageWaived ? "#8A5D08" : "#B01722",
            }}
          >
            {data.storageLabel}
          </p>
        </div>
      ) : null}

      {/* Where to come. The one office, in the owner's own wording. */}
      <div className="shrink-0" style={{ marginTop: "1.8mm" }}>
        <FieldLabel>{t(locale, "Collect from")}</FieldLabel>
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
          {t(locale, "Valid once. Anyone collecting for you brings their own ID.")}
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
