import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Download, MessageCircle } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { InvoiceEditor } from "@/components/app/invoice-editor";
import { MessageComposer } from "@/components/app/message-composer";
import { PrintButton } from "@/components/app/print-button";
import { Button } from "@/components/ui/button";
import { formatPackages } from "@/lib/constants";
import { LOCAL_CURRENCY, formatLocal, toLocal } from "@/lib/fx";
import { MESSAGE_KIND_LABELS, composeMessage, whatsappLink } from "@/lib/messages";
import { AIRPORT_LABELS, CATEGORY_LABELS, METHOD_LABELS } from "@/lib/cargo";
import {
  COMPANY,
  PAYMENT_ACCOUNTS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  STORAGE_POLICY,
} from "@/lib/constants";
import { formatDate, formatDateTime, formatWeight, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { shipmentQrDataUrl } from "@/lib/qr";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Invoice" };

const money = (value: number, currency: string) =>
  `${currency} ${value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export default async function InvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("finance.view");
  const canEdit = can(user.role, "invoice.edit");
  const canDiscount = can(user.role, "invoice.discount");
  const canMessage = can(user.role, "message.send");
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { OR: [{ id }, { invoiceNumber: decodeURIComponent(id).toUpperCase() }] },
    include: {
      customer: true,
      issuedBy: { select: { name: true } },
      payments: {
        orderBy: { paidAt: "asc" },
        include: { receipt: true, receivedBy: { select: { name: true } } },
      },
      shipment: {
        include: {
          cargoType: { select: { name: true } },
          batch: { select: { batchNumber: true } },
        },
      },
    },
  });

  if (!invoice) notFound();

  const shipment = invoice.shipment;
  const currency = invoice.currency;
  // The freight the customer is actually being charged. adjustInvoice computes
  // the total from this same coalesce, so the document has to print it or the
  // lines will not sum.
  const billedFreight =
    invoice.freightOverride === null
      ? toNumber(invoice.freightCost)
      : toNumber(invoice.freightOverride);
  const outstanding = toNumber(invoice.total) - toNumber(invoice.amountPaid);

  // The rate this invoice was raised at, not today's. A customer quoted a
  // shilling figure has to keep seeing that figure.
  const invoiceRate = invoice.exchangeRate ? toNumber(invoice.exchangeRate) : null;
  const localCurrency = invoice.localCurrency ?? LOCAL_CURRENCY;
  const totalLocal = invoice.totalLocal
    ? toNumber(invoice.totalLocal)
    : invoiceRate === null
      ? null
      : toLocal(toNumber(invoice.total), invoiceRate);
  const outstandingLocal =
    invoiceRate === null ? null : toLocal(Math.max(0, outstanding), invoiceRate);

  // The invoice carries the shipment's own QR, so the document and the cargo
  // share one identity all the way to release.
  const qr = await shipmentQrDataUrl(shipment.qrToken, 220);

  /**
   * The invoice, as a message.
   *
   * Not the payment reminder — that one is a conversation about money and
   * belongs on the follow-up queue. This is somebody handing over the bill:
   * what it is, what it covers, what it comes to, and where to send it.
   * Bolded for WhatsApp, blank lines between blocks, and each account on two
   * lines because on this message the labels do the work the reminder does
   * with three.
   *
   * The accounts come from PAYMENT_METHODS with their full labels, so this
   * cannot drift from the reminder, the PDF or the public tracking page.
   */
  const whatsappText = [
    `*${COMPANY.name.toUpperCase()}*`,
    ``,
    `*Invoice:* ${invoice.invoiceNumber}`,
    `*Customer:* ${invoice.customer.name}`,
    `*Shipment:* ${shipment.trackingNumber}`,
    ``,
    `*Cargo:* ${CATEGORY_LABELS[shipment.cargoCategory]}${shipment.cargoType ? ` (${shipment.cargoType.name})` : ""}`,
    `*Weight:* ${formatWeight(shipment.weightKg)} · ${formatPackages(shipment.packages, shipment.packageType)}`,
    ``,
    `*Total:* ${money(toNumber(invoice.total), currency)}` +
      (totalLocal === null ? "" : ` / ${formatLocal(totalLocal, localCurrency)}`),
    outstanding > 0
      ? `*Outstanding:* ${money(outstanding, currency)}` +
        (outstandingLocal === null
          ? ""
          : ` / ${formatLocal(outstandingLocal, localCurrency)}`)
      : `*Paid in full* — asante.`,
    ``,
    // Only worth printing while there is something to pay.
    ...(outstanding > 0
      ? [
          `*Payment Options*`,
          ``,
          ...PAYMENT_METHODS.flatMap((account) => [
            `*${account.label}*`,
            `${account.number} — ${account.accountName}`,
            ``,
          ]),
        ]
      : []),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/app/cargo/${shipment.trackingNumber}`}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to shipment
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a
              href={`https://wa.me/${(invoice.customer.phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(whatsappText)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle className="mr-2 h-4 w-4" />
              Send on WhatsApp
            </a>
          </Button>
          {/* A real file, not a print dialog — the point is something that can
              be attached to a WhatsApp message. Refused on a draft. */}
          <Button asChild variant="brand">
            <a href={`/app/finance/invoices/${invoice.invoiceNumber}/pdf`}>
              <Download className="mr-2 h-4 w-4" />
              Download PDF
            </a>
          </Button>
          <PrintButton label="Print" />
        </div>
      </div>

      {canEdit ? (
        <div className="mb-6">
          <InvoiceEditor
            invoiceId={invoice.id}
            currency={currency}
            freight={toNumber(invoice.freightCost)}
            freightOverride={
              invoice.freightOverride === null
                ? null
                : toNumber(invoice.freightOverride)
            }
            storage={toNumber(invoice.storageCharge)}
            discount={toNumber(invoice.discount)}
            otherCharges={toNumber(invoice.otherCharges)}
            exchangeRate={invoiceRate}
            localCurrency={localCurrency}
            notes={invoice.notes}
            locked={toNumber(invoice.amountPaid) > 0}
            canDiscount={canDiscount}
          />
        </div>
      ) : null}

      <article className="print-plain rounded-xl border-2 bg-white p-8 text-black shadow-soft">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-black/80 pb-5">
          <div className="flex items-center gap-3">
            <BrandMark className="h-11 w-11" />
            <div>
              <p className="font-display text-xl font-bold leading-none">
                TARGET EXPRESS AIR CARGO
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.18em]">
                Invoice
              </p>
            </div>
          </div>
          <div className="text-right text-[11px] leading-relaxed">
            <p className="font-mono text-sm font-bold tabular">
              {invoice.invoiceNumber}
            </p>
            <p>Issued {formatDate(invoice.issuedAt)}</p>
            <p>{COMPANY.phone}</p>
            <p>{COMPANY.darAddress}</p>
          </div>
        </header>

        {/* Billed to / shipment */}
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-[9px] font-semibold uppercase tracking-widest text-black/55">
              Billed to
            </p>
            <p className="mt-1 text-base font-bold">{invoice.customer.name}</p>
            <p className="font-mono text-sm tabular">
              {invoice.customer.phone ?? "Phone not recorded"}
            </p>
            <p className="font-mono text-xs tabular text-black/60">
              {invoice.customer.code}
            </p>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-black/55">
                Shipment
              </p>
              <p className="mt-1 font-mono text-lg font-bold tabular">
                {shipment.trackingNumber}
              </p>
              <p className="text-xs">
                {shipment.batch ? `${shipment.batch.batchNumber} · ` : ""}
                {AIRPORT_LABELS[shipment.origin]}
              </p>
            </div>
            <Image
              src={qr}
              alt={`QR for ${shipment.trackingNumber}`}
              width={72}
              height={72}
              className="shrink-0 border border-black/20"
              unoptimized
            />
          </div>
        </div>

        {/* Cargo */}
        <dl className="mt-6 grid grid-cols-2 gap-4 border-y border-black/20 py-4 sm:grid-cols-4">
          {[
            { label: "Cargo category", value: CATEGORY_LABELS[shipment.cargoCategory] },
            { label: "Cargo type", value: shipment.cargoType?.name ?? "—" },
            { label: "Weight", value: formatWeight(shipment.weightKg) },
            {
              label: "Quantity",
              value: formatPackages(shipment.packages, shipment.packageType),
            },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-[9px] font-semibold uppercase tracking-widest text-black/55">
                {item.label}
              </dt>
              <dd className="mt-0.5 text-xs font-bold">{item.value}</dd>
            </div>
          ))}
        </dl>

        {/* Charges — with the working shown */}
        <table className="mt-6 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b-2 border-black/70 text-left">
              <th className="py-2 font-semibold">Description</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-black/15">
              <td className="py-2.5">
                <p className="font-medium">Air freight</p>
                <p className="text-[11px] text-black/60">
                  {shipment.quotedMethod
                    ? METHOD_LABELS[shipment.quotedMethod]
                    : "Weight-based"}
                  {shipment.quotedRate
                    ? ` · ${money(toNumber(shipment.quotedRate), currency)}${
                        shipment.quotedMethod === "FIXED_PER_ITEM" ? " each" : "/kg"
                      }`
                    : ""}
                  {shipment.quotedMethod === "FIXED_PER_ITEM"
                    ? ` × ${formatPackages(shipment.packages, shipment.packageType)}`
                    : shipment.chargeableKg
                      ? ` × ${toNumber(shipment.chargeableKg).toFixed(2)} kg chargeable`
                      : ""}
                </p>
              </td>
              <td className="py-2.5 text-right font-mono tabular">
                {/* What was actually billed — the correction when Finance made
                    one, the rate book otherwise. The same coalesce the total
                    was computed from, and the same one the PDF prints. Reading
                    freightCost alone made the line items on this page fail to
                    add up to the total sitting under them. */}
                {money(billedFreight, currency)}
              </td>
            </tr>

            {invoice.storageDays > 0 ? (
              <tr className="border-b border-black/15">
                <td className="py-2.5">
                  <p className="font-medium">Storage</p>
                  <p className="text-[11px] text-black/60">
                    {invoice.storageDays} chargeable day(s) beyond the{" "}
                    {STORAGE_POLICY.freeDays} free days, at{" "}
                    {money(STORAGE_POLICY.perDayUsd, STORAGE_POLICY.currency)}/day
                  </p>
                </td>
                <td className="py-2.5 text-right font-mono tabular">
                  {money(toNumber(invoice.storageCharge), currency)}
                </td>
              </tr>
            ) : null}

            {toNumber(invoice.otherCharges) > 0 ? (
              <tr className="border-b border-black/15">
                <td className="py-2.5 font-medium">Other charges</td>
                <td className="py-2.5 text-right font-mono tabular">
                  {money(toNumber(invoice.otherCharges), currency)}
                </td>
              </tr>
            ) : null}

            {toNumber(invoice.discount) > 0 ? (
              <tr className="border-b border-black/15">
                <td className="py-2.5 font-medium">Discount</td>
                <td className="py-2.5 text-right font-mono tabular">
                  −{money(toNumber(invoice.discount), currency)}
                </td>
              </tr>
            ) : null}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black/70">
              <td className="py-3 font-display text-base font-bold">Total</td>
              <td className="py-3 text-right font-mono text-base font-bold tabular">
                {money(toNumber(invoice.total), currency)}
              </td>
            </tr>
            {totalLocal !== null ? (
              <tr>
                <td className="pb-2 text-xs text-black/70">
                  In shillings at {invoiceRate?.toLocaleString()} / USD — the rate
                  on the day this invoice was raised
                </td>
                <td className="pb-2 text-right font-mono text-sm font-semibold tabular">
                  {formatLocal(totalLocal, localCurrency)}
                </td>
              </tr>
            ) : null}
            {invoice.payments.length > 0 ? (
              <tr>
                <td className="py-1 text-xs text-black/70">Paid to date</td>
                <td className="py-1 text-right font-mono text-xs tabular">
                  −{money(toNumber(invoice.amountPaid), currency)}
                </td>
              </tr>
            ) : null}
            <tr>
              <td className="pt-2 font-semibold">
                {outstanding <= 0 ? "Paid in full" : "Amount due"}
              </td>
              <td className="pt-2 text-right font-mono font-bold tabular">
                {money(Math.max(0, outstanding), currency)}
                {outstandingLocal !== null && outstanding > 0 ? (
                  <div className="text-xs font-semibold text-black/70">
                    {formatLocal(outstandingLocal, localCurrency)}
                  </div>
                ) : null}
              </td>
            </tr>
          </tfoot>
        </table>

        {invoice.payments.length > 0 ? (
          <ul className="mt-3 space-y-0.5 text-[11px] text-black/70">
            {invoice.payments.map((payment) => (
              <li key={payment.id} className="flex justify-between gap-4">
                <span>
                  {payment.receipt?.receiptNumber} ·{" "}
                  {PAYMENT_METHOD_LABELS[payment.method]}
                  {payment.reference ? ` · ${payment.reference}` : ""} ·{" "}
                  {formatDate(payment.paidAt)}
                </span>
                <span className="font-mono tabular">
                  {money(toNumber(payment.amount), payment.currency)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Payment options */}
        <section className="mt-7 rounded-lg border-2 border-black/70 p-4">
          <h2 className="font-display text-sm font-bold uppercase tracking-wide">
            How to pay
          </h2>

          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-black/55">
                Mobile money
              </p>
              <ul className="mt-1.5 space-y-2">
                {PAYMENT_ACCOUNTS.mobileMoney.map((account) => (
                  <li key={account.number} className="text-xs">
                    <p className="font-semibold">{account.provider}</p>
                    <p className="font-mono text-sm font-bold tabular">
                      {account.number}
                    </p>
                    <p className="text-[10px] text-black/60">
                      {account.accountName}
                    </p>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[9px] font-semibold uppercase tracking-widest text-black/55">
                Bank transfer
              </p>
              <ul className="mt-1.5 space-y-2">
                {PAYMENT_ACCOUNTS.banks.map((bank) => (
                  <li key={bank.bank} className="text-xs">
                    <p className="font-semibold">{bank.bank}</p>
                    {bank.accounts.map((account) => (
                      <p
                        key={account.number}
                        className="font-mono text-sm font-bold tabular"
                      >
                        {account.currency}: {account.number}
                      </p>
                    ))}
                    <p className="text-[10px] text-black/60">{bank.accountName}</p>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <p className="mt-3 border-t border-black/20 pt-2 text-[10px] text-black/70">
            Quote <strong>{shipment.trackingNumber}</strong> as the payment
            reference so we can match your payment immediately.
          </p>
        </section>

        {/* Terms */}
        <section className="mt-5">
          <h2 className="text-[9px] font-semibold uppercase tracking-widest text-black/55">
            Storage policy
          </h2>
          <div className="mt-1.5 space-y-1 text-[11px] leading-relaxed">
            {STORAGE_POLICY.text.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </section>

        <footer className="mt-6 flex flex-wrap items-end justify-between gap-3 border-t border-black/20 pt-3 text-[10px] text-black/60">
          <p>
            Issued by {invoice.issuedBy?.name ?? "Finance"} ·{" "}
            {formatDateTime(invoice.issuedAt)}
          </p>
          <p>
            {COMPANY.email} · {COMPANY.phone}
          </p>
        </footer>
      </article>
      {canMessage ? (
        <section className="no-print mt-6 rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="mb-1 font-semibold">Send this invoice</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Open it in WhatsApp, then record it — recording marks the invoice as
            sent, which is what the follow-up queue works from.
          </p>
          <MessageComposer
            customerId={invoice.customerId}
            customerName={invoice.customer.name}
            customerPhone={invoice.customer.phone}
            shipmentId={shipment.id}
            invoiceId={invoice.id}
            defaultKind="INVOICE_ISSUED"
            whatsappBase={
              invoice.customer.phone
                ? whatsappLink(invoice.customer.phone, "").split("?")[0]
                : null
            }
            templates={(
              Object.keys(MESSAGE_KIND_LABELS) as (keyof typeof MESSAGE_KIND_LABELS)[]
            ).map((kind) => ({
              kind,
              label: MESSAGE_KIND_LABELS[kind],
              body: composeMessage(kind, {
                customerName: invoice.customer.name,
                trackingNumber: shipment.trackingNumber,
                description: shipment.description,
                invoiceNumber: invoice.invoiceNumber,
                amountUsd: outstanding > 0 ? outstanding : toNumber(invoice.total),
                amountLocal:
                  outstandingLocal !== null && outstanding > 0
                    ? outstandingLocal
                    : totalLocal,
                localCurrency,
                storageDays: invoice.storageDays,
                weightKg: toNumber(shipment.weightKg),
                // The rate frozen on THIS invoice. Publishing a new rate
                // tomorrow must not restate what this customer was quoted.
                exchangeRate: invoiceRate,
              }),
            }))}
          />
        </section>
      ) : null}

    </div>
  );
}
