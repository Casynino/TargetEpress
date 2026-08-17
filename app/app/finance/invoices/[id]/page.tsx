import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Download, FileClock, MessageCircle } from "lucide-react";

import { InvoiceDocument } from "@/components/app/invoice-document";
import { InvoiceEditor } from "@/components/app/invoice-editor";
import { MessageComposer } from "@/components/app/message-composer";
import { PaymentCorrection } from "@/components/app/payment-correction";
import { PrintButton } from "@/components/app/print-button";
import { Button } from "@/components/ui/button";
import { formatPackages } from "@/lib/constants";
import { accountsForInvoice } from "@/lib/company-settings";
import { LOCAL_CURRENCY, formatLocal, toLocal } from "@/lib/fx";
import { MESSAGE_KIND_LABELS, composeMessage, whatsappLink } from "@/lib/messages";
import { AIRPORT_LABELS, CATEGORY_LABELS, METHOD_LABELS } from "@/lib/cargo";
import {
  COMPANY,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/constants";
import { formatDate, formatDateTime, formatWeight, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { shipmentQrDataUrl } from "@/lib/qr";
import { requirePermission } from "@/lib/session";
import { cargoText, viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Invoice") };
}

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
  const locale = await viewerLocale();
  const canEdit = can(user.role, "invoice.edit");
  const canDiscount = can(user.role, "invoice.discount");
  const canMessage = can(user.role, "message.send");
  /* Un-recording money is a different authority from recording it: it restates
     a figure the ledger has already reported. Same gate adjustInvoice uses. */
  const canCorrectPayments = can(user.role, "ledger.adjust");
  const { id } = await params;

  const invoice = await prisma.invoice.findFirst({
    where: { OR: [{ id }, { invoiceNumber: decodeURIComponent(id).toUpperCase() }] },
    include: {
      customer: true,
      issuedBy: { select: { name: true } },
      payments: {
        orderBy: { paidAt: "asc" },
        include: {
          receipt: true,
          receivedBy: { select: { name: true } },
          /* Who cancelled it and why, so a struck-through line can say so
             instead of just going quiet. */
          voidedBy: { select: { name: true } },
        },
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

  // A settled invoice shows what was paid, not a zero: "TZS 0" under the word
  // PAID reads as a document that failed to render, and it is the copy the
  // customer keeps.
  const paidInFull = outstanding <= 0.005;
  const heroUsd = paidInFull ? toNumber(invoice.total) : Math.max(0, outstanding);
  const heroLocal =
    invoiceRate === null ? null : toLocal(heroUsd, invoiceRate);

  /*
    A draft is the system's own working figure and must not leave the building.

    lib/auto-price raises every invoice as a DRAFT at Dar check-in, so this is
    the state Finance opens most often — and both ways of sending it out were
    offered here regardless. "Download PDF" is a plain <a>, so the route's
    honest 409 took the browser out of the app and onto a raw JSON body the
    user had to press Back to escape; "Send on WhatsApp" had no draft guard at
    all and would have quoted the customer an unconfirmed total. The cargo
    screen already draws exactly this line (components/app/shipment-actions),
    so this page now agrees with it, and the route's 409 stays as the net
    behind both.
  */
  const isDraft = invoice.status === "DRAFT";

  // What this invoice was issued with, not what Settings says today.
  const accounts = accountsForInvoice(invoice.paymentSnapshot);

  // How the freight figure was reached, in one line. Assembled here because it
  // is the only part of the document that has to reach into the rate book.
  const freightNote = [
    `${t(locale, AIRPORT_LABELS[shipment.origin])} — ${t(locale, "Dar es Salaam")}`,
    shipment.quotedMethod
      ? t(locale, METHOD_LABELS[shipment.quotedMethod])
      : t(locale, "Weight-based"),
    shipment.quotedRate
      ? `${money(toNumber(shipment.quotedRate), currency)}${
          shipment.quotedMethod === "FIXED_PER_ITEM"
            ? ` ${t(locale, "each")}`
            : "/kg"
        }`
      : null,
    shipment.quotedMethod === "FIXED_PER_ITEM"
      ? `× ${formatPackages(shipment.packages, shipment.packageType, locale)}`
      : shipment.chargeableKg
        ? `× ${toNumber(shipment.chargeableKg).toFixed(2)} ${t(locale, "kg chargeable")}`
        : null,
  ]
    .filter(Boolean)
    .join(" · ");

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
    `*Weight:* ${formatWeight(shipment.weightKg)} · ${formatPackages(shipment.packages, shipment.packageType, locale)}`,
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
            {t(locale, "Back to cargo")}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          {isDraft ? null : (
            <>
              <Button asChild variant="outline">
                <a
                  href={`https://wa.me/${(invoice.customer.phone ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(whatsappText)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  {t(locale, "Send on WhatsApp")}
                </a>
              </Button>
              {/* A real file, not a print dialog — the point is something that
                  can be attached to a WhatsApp message. */}
              <Button asChild variant="brand">
                <a href={`/app/finance/invoices/${invoice.invoiceNumber}/pdf`}>
                  <Download className="mr-2 h-4 w-4" />
                  {t(locale, "Download PDF")}
                </a>
              </Button>
            </>
          )}
          <PrintButton label={t(locale, "Print")} />
        </div>
      </div>

      {/* Said on the screen the reader is already on, in place of the two
          buttons, rather than discovered on a JSON error page after a full
          navigation out of the app. The confirm control itself lives on the
          cargo screen — one place re-prices, deliberately — so this points
          there rather than becoming a second door to the same action. */}
      {isDraft ? (
        <div className="no-print mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-signal/40 bg-signal/5 p-4">
          <FileClock className="h-5 w-5 shrink-0 text-signal" />
          <p className="min-w-0 flex-1 text-sm text-signal">
            {t(
              locale,
              "This price has not been confirmed yet. Confirm it before downloading or sending the invoice."
            )}
          </p>
          <Button asChild variant="signal" size="sm">
            <Link href={`/app/cargo/${shipment.trackingNumber}`}>
              {t(locale, "Confirm the price")}
            </Link>
          </Button>
        </div>
      ) : null}

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
            canCorrect={can(user.role, "ledger.adjust")}
            alreadyPaid={toNumber(invoice.amountPaid)}
            canDiscount={canDiscount}
          />
        </div>
      ) : null}

      <InvoiceDocument
        invoiceNumber={invoice.invoiceNumber}
        issuedOn={formatDate(invoice.issuedAt, locale)}
        dueOn={invoice.dueDate ? formatDate(invoice.dueDate, locale) : null}
        issuedAtLabel={formatDateTime(invoice.issuedAt, locale)}
        issuedByName={invoice.issuedBy?.name ?? null}
        customer={{
          name: invoice.customer.name,
          phone: invoice.customer.phone,
          code: invoice.customer.code,
          city: invoice.customer.city,
        }}
        shipment={{
          trackingNumber: shipment.trackingNumber,
          batchNumber: shipment.batch?.batchNumber ?? null,
          originLabel: t(locale, AIRPORT_LABELS[shipment.origin]),
          description: cargoText(locale, shipment, "description"),
          weightLabel: formatWeight(shipment.weightKg),
          quantityLabel: formatPackages(shipment.packages, shipment.packageType, locale),
          cargoLabel:
            shipment.cargoType?.name ??
            t(locale, CATEGORY_LABELS[shipment.cargoCategory]),
        }}
        freightNote={freightNote}
        currency={currency}
        localCurrency={localCurrency}
        exchangeRate={invoiceRate}
        billedFreight={billedFreight}
        storageCharge={toNumber(invoice.storageCharge)}
        storageDays={invoice.storageDays}
        storageWaived={toNumber(invoice.storageWaivedUsd)}
        otherCharges={toNumber(invoice.otherCharges)}
        discount={toNumber(invoice.discount)}
        total={toNumber(invoice.total)}
        amountPaid={toNumber(invoice.amountPaid)}
        paidInFull={paidInFull}
        heroUsd={heroUsd}
        heroLocal={heroLocal}
        payments={invoice.payments.map((payment) => ({
          id: payment.id,
          line: [
            payment.receipt?.receiptNumber,
            t(locale, PAYMENT_METHOD_LABELS[payment.method]),
            payment.reference,
            formatDate(payment.paidAt, locale),
          ]
            .filter(Boolean)
            .join(" · "),
          amount: money(toNumber(payment.amount), payment.currency),
          voided: payment.voidedAt !== null,
          voidNote: payment.voidedAt
            ? `${t(locale, "cancelled")} ${formatDate(payment.voidedAt, locale)}`
            : null,
          /*
            Mistakes happen at a counter, and until now a recorded payment was
            the one money record with no way back — so the only fix was to
            invent another record somewhere else.

            Offered only to whoever may adjust the ledger. Reversing a payment
            restates a figure the ledger has already reported, which is a
            different authority from taking the money in the first place.
          */
          action: canCorrectPayments ? (
            <PaymentCorrection
              paymentId={payment.id}
              reference={payment.reference}
              note={payment.note}
              paidAt={payment.paidAt.toISOString().slice(0, 10)}
              voided={payment.voidedAt !== null}
              voidReason={payment.voidReason}
              voidedBy={payment.voidedBy?.name ?? null}
            />
          ) : null,
        }))}
        accounts={accounts}
        qrDataUrl={qr}
        money={money}
        formatLocal={formatLocal}
      />
      {/* The third door out of this page, closed on a draft for the same
          reason as the other two: recording a send marks the invoice sent, and
          the follow-up queue would then be chasing a figure nobody signed. */}
      {canMessage && !isDraft ? (
        <section className="no-print mt-6 rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="mb-1 font-semibold">
            {t(locale, "Send this invoice")}
          </h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {t(
              locale,
              "Open it in WhatsApp, then record it — recording marks the invoice as sent, which is what the follow-up queue works from."
            )}
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
              label: t(locale, MESSAGE_KIND_LABELS[kind]),
              body: composeMessage(kind, {
                customerName: invoice.customer.name,
                trackingNumber: shipment.trackingNumber,
                // The message goes to a Tanzanian customer in Swahili, so the
                // cargo line follows the CUSTOMER, not whoever is composing it.
                // A Guangzhou clerk sending this must not send 手机配件 to Dar.
                description: cargoText("en", shipment, "description"),
                invoiceNumber: invoice.invoiceNumber,
                amountUsd: outstanding > 0 ? outstanding : toNumber(invoice.total),
                amountLocal:
                  outstandingLocal !== null && outstanding > 0
                    ? outstandingLocal
                    : totalLocal,
                localCurrency,
                storageDays: invoice.storageDays,
                weightKg: toNumber(shipment.weightKg),
                /*
                  Just the price, in the customer's terms.

                  It carried the whole freight note — route, method, rate and
                  chargeable weight — which reads as paperwork and invited the
                  wrong question: a 0.6 kg parcel billed at a 1 kg minimum
                  showed both numbers and looked like a mistake. The customer
                  asked one thing, "what is the rate", so the message answers
                  exactly that. The full working stays on the invoice, where
                  somebody querying it will look.
                */
                freightBasis: shipment.quotedRate
                  ? `${money(toNumber(shipment.quotedRate), currency)}/${
                      shipment.quotedMethod === "FIXED_PER_ITEM" ? "pcs" : "kg"
                    }`
                  : null,
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
