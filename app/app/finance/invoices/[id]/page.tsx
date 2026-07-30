import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MessageCircle } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { PrintButton } from "@/components/app/print-button";
import { Button } from "@/components/ui/button";
import { AIRPORT_LABELS, CATEGORY_LABELS, METHOD_LABELS } from "@/lib/cargo";
import {
  COMPANY,
  PAYMENT_ACCOUNTS,
  PAYMENT_METHOD_LABELS,
  STORAGE_POLICY,
} from "@/lib/constants";
import { formatDate, formatDateTime, formatWeight, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
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
  await requirePermission("finance.view");
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
  const outstanding = toNumber(invoice.total) - toNumber(invoice.amountPaid);

  // The invoice carries the shipment's own QR, so the document and the cargo
  // share one identity all the way to release.
  const qr = await shipmentQrDataUrl(shipment.qrToken, 220);

  const whatsappText = [
    `Target Express Air Cargo — Invoice ${invoice.invoiceNumber}`,
    `Shipment: ${shipment.trackingNumber}`,
    `Cargo: ${CATEGORY_LABELS[shipment.cargoCategory]}${shipment.cargoType ? ` (${shipment.cargoType.name})` : ""}`,
    `Weight: ${formatWeight(shipment.weightKg)} · ${shipment.packages} package(s)`,
    `Total: ${money(toNumber(invoice.total), currency)}`,
    outstanding > 0
      ? `Outstanding: ${money(outstanding, currency)}`
      : "Paid in full — thank you.",
    "",
    "Payment options:",
    ...PAYMENT_ACCOUNTS.mobileMoney.map(
      (m) => `${m.provider}: ${m.number} (${m.accountName})`
    ),
    ...PAYMENT_ACCOUNTS.banks.flatMap((b) =>
      b.accounts.map((a) => `${b.bank} ${a.currency}: ${a.number} (${b.accountName})`)
    ),
  ].join("\n");

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/app/shipments/${shipment.trackingNumber}`}>
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
          <PrintButton label="Print / save PDF" />
        </div>
      </div>

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
            { label: "Packages", value: String(shipment.packages) },
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
                    ? ` × ${shipment.packages} item(s)`
                    : shipment.chargeableKg
                      ? ` × ${toNumber(shipment.chargeableKg).toFixed(2)} kg chargeable`
                      : ""}
                </p>
              </td>
              <td className="py-2.5 text-right font-mono tabular">
                {money(toNumber(invoice.freightCost), currency)}
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
    </div>
  );
}
