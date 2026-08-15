import Image from "next/image";

import {
  DocumentFacts,
  DocumentField,
  DocumentFooter,
  DocumentHeader,
  DocumentSheet,
  DocumentStamp,
} from "@/components/app/document-sheet";
import { STORAGE_POLICY, type CollectionAccount } from "@/lib/constants";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { cargoText, viewerLocale } from "@/lib/viewer";

/**
 * The invoice itself — the sheet, not the page around it.
 *
 * Pulled out of the route for two reasons. The document is the thing a customer
 * receives, and it was only reachable through a permission check, a database
 * query and a login, which meant nobody could look at a change to it without
 * being Finance. And a document that takes plain values cannot quietly start
 * re-deriving a figure from a Prisma object: everything here arrives already
 * decided, so what is printed is what the record says.
 *
 * Money arrives as formatted strings for the same reason. Rounding a total in
 * two places is how a document ends up disagreeing with the invoice it claims
 * to be.
 */

export type InvoiceDocumentProps = {
  /**
   * The reader's language. Optional: the document resolves it itself when the
   * page does not say, so no caller has to be changed to translate this sheet.
   */
  locale?: Locale;
  invoiceNumber: string;
  issuedOn: string;
  dueOn: string | null;
  issuedAtLabel: string;
  issuedByName: string | null;

  customer: {
    name: string;
    phone: string | null;
    code: string;
    city: string | null;
  };

  shipment: {
    trackingNumber: string;
    batchNumber: string | null;
    originLabel: string;
    description: string;
    /** The renderings, when the page passed them through rather than resolving. */
    descriptionEn?: string | null;
    descriptionZh?: string | null;
    descriptionLang?: string | null;
    weightLabel: string;
    quantityLabel: string;
    cargoLabel: string;
  };

  /** How the freight figure was reached, in one line. Assembled by the page. */
  freightNote: string;

  currency: string;
  localCurrency: string;
  /** Locked when the invoice was raised; null on invoices raised before rates. */
  exchangeRate: number | null;

  billedFreight: number;
  storageCharge: number;
  storageDays: number;
  otherCharges: number;
  discount: number;
  total: number;
  amountPaid: number;

  /** true once nothing is owed. Decides the stamp, the panel and the accounts. */
  paidInFull: boolean;
  /** What the big figure says: the total when settled, the balance when not. */
  heroUsd: number;
  heroLocal: number | null;

  payments: { id: string; line: string; amount: string }[];
  accounts: CollectionAccount[];
  qrDataUrl: string;

  money: (value: number, currency: string) => string;
  formatLocal: (value: number, currency: string) => string;
};

export async function InvoiceDocument({
  locale: localeProp,
  invoiceNumber,
  issuedOn,
  dueOn,
  issuedAtLabel,
  issuedByName,
  customer,
  shipment,
  freightNote,
  currency,
  localCurrency,
  exchangeRate,
  billedFreight,
  storageCharge,
  storageDays,
  otherCharges,
  discount,
  total,
  amountPaid,
  paidInFull,
  heroUsd,
  heroLocal,
  payments,
  accounts,
  qrDataUrl,
  money,
  formatLocal,
}: InvoiceDocumentProps) {
  const locale = localeProp ?? (await viewerLocale());
  return (
    <DocumentSheet>
      <DocumentHeader
        title={t(locale, "Invoice")}
        badge={
          <DocumentStamp
            tone={paidInFull ? "success" : amountPaid ? "warning" : "danger"}
          >
            {t(locale, paidInFull ? "Paid" : amountPaid > 0 ? "Part paid" : "Unpaid")}
          </DocumentStamp>
        }
        meta={
          <>
            <p className="font-mono text-sm font-bold tabular text-[#182A48]">
              {invoiceNumber}
            </p>
            <p>
              {t(locale, "Issued")} {issuedOn}
            </p>
            {dueOn ? (
              <p>
                {t(locale, "Due")} {dueOn}
              </p>
            ) : null}
          </>
        }
      />

      {/* Who it is for, and what it is for. */}
      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <DocumentField label={t(locale, "Billed to")}>
          <p className="text-base font-bold">{customer.name}</p>
          <p className="font-mono text-sm tabular">
            {customer.phone ?? t(locale, "Phone not recorded")}
          </p>
          <p className="font-mono text-xs tabular text-black/60">
            {customer.code}
          </p>
          {customer.city ? (
            <p className="text-xs text-black/60">{customer.city}</p>
          ) : null}
        </DocumentField>

        <div className="flex items-start justify-between gap-3">
          <DocumentField label={t(locale, "Cargo")}>
            <p className="font-mono text-lg font-bold tabular text-[#182A48]">
              {shipment.trackingNumber}
            </p>
            <p className="text-xs">
              {shipment.batchNumber ? `${shipment.batchNumber} · ` : ""}
              {t(locale, shipment.originLabel)} — {t(locale, "Dar es Salaam")}
            </p>
          </DocumentField>
          {/* The shipment's own code. The document and the cargo share one
              identity all the way to release, so a counter clerk can scan the
              paper when the box is still on the shelf. */}
          <Image
            src={qrDataUrl}
            alt={`${t(locale, "QR for")} ${shipment.trackingNumber}`}
            width={72}
            height={72}
            className="shrink-0 border border-black/20"
            unoptimized
          />
        </div>
      </div>

      <DocumentFacts
        items={[
          { label: t(locale, "Weight"), value: shipment.weightLabel },
          {
            label: t(locale, "Quantity"),
            value: shipment.quantityLabel,
          },
          {
            label: t(locale, "Cargo"),
            value: t(locale, shipment.cargoLabel),
          },
          {
            label: t(locale, "Storage days"),
            value:
              storageDays > 0
                ? `${storageDays} ${t(locale, "chargeable")}`
                : t(locale, "None"),
          },
        ]}
      />

      <div className="mt-5">
        <DocumentField label={t(locale, "Goods")}>
          <p className="text-sm leading-relaxed">
            {cargoText(locale, shipment, "description")}
          </p>
        </DocumentField>
      </div>

      {/* Charges — with the working shown */}
      <table className="mt-6 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-[#182A48] text-left text-white">
            <th className="rounded-l-md py-2.5 pl-4 text-xs font-bold uppercase tracking-[0.18em]">
              {t(locale, "Description")}
            </th>
            <th className="rounded-r-md py-2.5 pr-4 text-right text-xs font-bold uppercase tracking-[0.18em]">
              {t(locale, "Amount")}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-black/15">
            <td className="py-2.5 pl-4">
              <p className="font-semibold">{t(locale, "Air freight")}</p>
              <p className="text-xs text-black/55">{freightNote}</p>
            </td>
            <td className="py-2.5 pr-4 text-right font-mono tabular">
              {/* What was actually billed — the correction when Finance made
                  one, the rate book otherwise. The same coalesce the total
                  was computed from, and the same one the PDF prints. Reading
                  freightCost alone made the line items on this page fail to
                  add up to the total sitting under them. */}
              {money(billedFreight, currency)}
            </td>
          </tr>

          {storageDays > 0 ? (
            <tr className="border-b border-black/15">
              <td className="py-2.5 pl-4">
                <p className="font-semibold">{t(locale, "Storage")}</p>
                <p className="text-xs text-black/55">
                  {storageDays} {t(locale, "chargeable day(s) beyond the")}{" "}
                  {STORAGE_POLICY.freeDays} {t(locale, "free days, at")}{" "}
                  {money(STORAGE_POLICY.perDayUsd, STORAGE_POLICY.currency)}
                  {t(locale, "/day")}
                </p>
              </td>
              <td className="py-2.5 pr-4 text-right font-mono tabular">
                {money(storageCharge, currency)}
              </td>
            </tr>
          ) : null}

          {otherCharges > 0 ? (
            <tr className="border-b border-black/15">
              <td className="py-2.5 pl-4 font-semibold">
                {t(locale, "Other charges")}
              </td>
              <td className="py-2.5 pr-4 text-right font-mono tabular">
                {money(otherCharges, currency)}
              </td>
            </tr>
          ) : null}

          {discount > 0 ? (
            <tr className="border-b border-black/15">
              <td className="py-2.5 pl-4 font-semibold">
                {t(locale, "Discount")}
              </td>
              <td className="py-2.5 pr-4 text-right font-mono tabular">
                −{money(discount, currency)}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {/*
        The figure, in the currency it gets paid in.

        The invoice is raised in dollars because the rate card is, and the
        person settling it walks into a shop and sends shillings. Leading with
        USD meant every customer did the conversion themselves, at whatever
        rate their phone offered, and then argued about the difference. The
        dollar figure stays directly underneath, with the rate this invoice
        was locked at — it is the reference, not the ask.
      */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_260px]">
        <dl className="space-y-1.5 self-end text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-black/60">{t(locale, "Total")}</dt>
            <dd className="font-mono tabular">
              {money(total, currency)}
            </dd>
          </div>
          {amountPaid > 0 ? (
            <div className="flex justify-between gap-4">
              <dt className="text-black/60">{t(locale, "Received")}</dt>
              <dd className="font-mono tabular">
                −{money(amountPaid, currency)}
              </dd>
            </div>
          ) : null}
          {exchangeRate !== null ? (
            <div className="flex justify-between gap-4">
              <dt className="text-black/60">{t(locale, "Rate on issue")}</dt>
              <dd className="font-mono tabular">
                {exchangeRate.toLocaleString()} {localCurrency}/{currency}
              </dd>
            </div>
          ) : null}
        </dl>

        <div
          className={`rounded-lg p-5 text-white ${
            paidInFull ? "bg-[#117447]" : "bg-[#182A48]"
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/70">
            {t(locale, paidInFull ? "Paid in full" : "Amount due")}
          </p>
          <p className="mt-1.5 font-display text-[26px] font-bold leading-none tabular">
            {heroLocal === null
              ? money(heroUsd, currency)
              : formatLocal(heroLocal, localCurrency)}
          </p>
          <p className="mt-2 text-xs text-white/75">
            {heroLocal === null
              ? t(locale, "No exchange rate was locked on this invoice")
              : `${money(heroUsd, currency)} ${t(
                  locale,
                  paidInFull ? "received with thanks" : "at the rate on this invoice"
                )}`}
          </p>
        </div>
      </div>

      {payments.length > 0 ? (
        <ul className="mt-4 space-y-0.5 border-t border-black/15 pt-3 text-xs text-black/70">
          {payments.map((payment) => (
            <li key={payment.id} className="flex justify-between gap-4">
              <span>{payment.line}</span>
              <span className="font-mono tabular">{payment.amount}</span>
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        Payment instructions, only while there is something to pay.

        A settled invoice that still lists Lipa numbers is an invitation to
        pay twice, and getting a duplicate back out of a mobile money account
        costs a fortnight of somebody's week.
      */}
      {paidInFull ? (
        <p className="mt-7 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[#117447]/10 px-5 py-4 text-sm font-bold text-[#117447]">
          {t(locale, "Settled in full — asante kwa kutuamini.")}
          <span className="text-xs font-medium text-black/55">
            {t(locale, "No payment is outstanding on this invoice.")}
          </span>
        </p>
      ) : (
        <section className="mt-7 rounded-lg border-2 border-[#182A48] p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-sm font-bold uppercase tracking-wide text-[#182A48]">
              {t(locale, "How to pay")}
            </h2>
            <p className="text-xs text-black/55">
              {t(locale, "Quote")} <strong>{shipment.trackingNumber}</strong>{" "}
              {t(locale, "as the reference")}
            </p>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            {/* The accounts THIS invoice was issued with. Reading today's
                settings would reprint numbers the customer was never given —
                see accountsForInvoice. */}
            {accounts.map((account) => (
              <div key={`${account.label}-${account.number}`}>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-black/50">
                  {account.label}
                </p>
                <p className="font-mono text-base font-bold tabular text-[#182A48]">
                  {account.number}
                </p>
                <p className="text-xs text-black/55">{account.accountName}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-5">
        <DocumentField label={t(locale, "Storage policy")}>
          <div className="space-y-1 text-xs leading-relaxed">
            {STORAGE_POLICY.text.map((line) => (
              <p key={line}>{t(locale, line)}</p>
            ))}
          </div>
        </DocumentField>
      </section>

      <DocumentFooter>
        <p>
          {t(locale, "Issued by")} {issuedByName ?? t(locale, "Finance")} ·{" "}
          {issuedAtLabel}
        </p>
      </DocumentFooter>
    </DocumentSheet>
  );
}
