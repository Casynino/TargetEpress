import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Download, FileClock, MessageCircle } from "lucide-react";

import { CreditRequest } from "@/components/app/credit-request";
import { InvoiceDocument } from "@/components/app/invoice-document";
import { InvoiceEditor } from "@/components/app/invoice-editor";
import { MessageComposer } from "@/components/app/message-composer";
import { SmartBack } from "@/components/app/smart-back";
import { InvoiceVoid } from "@/components/app/invoice-void";
import { LedgerRowFix } from "@/components/app/ledger-row-fix";
import { PrintButton } from "@/components/app/print-button";
import { Button } from "@/components/ui/button";
import { formatPackages } from "@/lib/constants";
import { activeAccounts } from "@/lib/accounts";
import { accountsForInvoice } from "@/lib/company-settings";
import { LOCAL_CURRENCY, formatLocal, toLocal } from "@/lib/fx";
import { MESSAGE_KIND_LABELS, composeMessage, trackLink, whatsappLink } from "@/lib/messages";
import { freightBasisOf } from "@/lib/support";
import { AIRPORT_LABELS, CATEGORY_LABELS, METHOD_LABELS } from "@/lib/cargo";
import {
  COMPANY,
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
      /* Who asked for the credit and who decided it — the panel names both, so
         nobody has to open the audit log to find out who let cargo go unpaid. */
      creditRequestedBy: { select: { name: true } },
      creditDecidedBy: { select: { name: true } },
      payments: {
        orderBy: { paidAt: "asc" },
        include: {
          /* One bill or several. A merged payment's figure cannot be
             corrected here — see changePaymentAmount. */
          _count: { select: { allocations: true } },
          receipt: true,
          receivedBy: { select: { name: true } },
          /* Which account took it, printed on the receipt line below in place
             of the payment method that used to sit there. */
          account: { select: { name: true } },
          /* Who cancelled it and why, so a struck-through line can say so
             instead of just going quiet. */
          voidedBy: { select: { name: true } },
          proofs: {
            select: { id: true, url: true, filename: true, contentType: true, bytes: true },
          },
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

  /*
    THE CREDIT STATE OF THIS BILL, worked out once here rather than in the JSX.

    Four things can be true and each reads differently: nothing has been asked;
    a request is with Finance; credit was granted, with a due date; or it was
    refused, and the bill is back on cash terms. Only the first offers a button,
    and only to a desk that holds credit.request.
  */
  const creditState = invoice.creditStatus;
  const canAskCredit =
    can(user.role, "credit.request") &&
    creditState === "NONE" &&
    invoice.status !== "DRAFT" &&
    invoice.status !== "VOID" &&
    !paidInFull;

  const creditPanel =
    creditState === "NONE" && !canAskCredit ? null : (
      <div
        className={
          creditState === "APPROVED"
            ? "rounded-xl border border-warning/40 bg-warning/[0.05] px-4 py-3"
            : creditState === "REQUESTED"
              ? "rounded-xl border border-brand/40 bg-brand/[0.04] px-4 py-3"
              : creditState === "REJECTED"
                ? "rounded-xl border bg-muted/20 px-4 py-3"
                : ""
        }
      >
        {creditState === "APPROVED" ? (
          <>
            <p className="text-xs font-semibold text-warning">
              {t(locale, "ON CREDIT — payment pending")}
              {invoice.creditTermDays
                ? ` · ${invoice.creditTermDays} ${t(locale, "day terms")}`
                : ""}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {invoice.dueDate
                ? `${t(locale, "Due")} ${formatDate(invoice.dueDate, locale)} · `
                : ""}
              {money(Math.max(0, outstanding), currency)} {t(locale, "still owed")}
              {invoice.creditDecidedBy?.name
                ? ` · ${t(locale, "approved by")} ${invoice.creditDecidedBy.name}`
                : ""}
              {invoice.creditDecisionNote ? ` · “${invoice.creditDecisionNote}”` : ""}
            </p>
          </>
        ) : creditState === "REQUESTED" ? (
          <>
            <p className="text-xs font-semibold text-brand">
              {t(locale, "Credit requested — waiting on Finance")}
              {invoice.creditTermDays
                ? ` · ${invoice.creditTermDays} ${t(locale, "days")}`
                : ""}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {invoice.creditRequestedBy?.name
                ? `${t(locale, "asked by")} ${invoice.creditRequestedBy.name}`
                : ""}
              {invoice.creditRequestNote ? ` · “${invoice.creditRequestNote}”` : ""}
              {" · "}
              {t(locale, "the cargo stays here until they answer")}
            </p>
          </>
        ) : creditState === "REJECTED" ? (
          <>
            <p className="text-xs font-semibold">
              {t(locale, "Credit refused — this bill is on cash terms")}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {invoice.creditDecisionNote ?? t(locale, "no reason recorded")}
              {invoice.creditDecidedBy?.name ? ` — ${invoice.creditDecidedBy.name}` : ""}
            </p>
          </>
        ) : (
          <CreditRequest
            invoiceId={invoice.id}
            outstanding={money(Math.max(0, outstanding), currency)}
            defaultTerm={invoice.customer.creditTermDays ?? 14}
            limitLabel={
              invoice.customer.creditLimitUsd === null
                ? null
                : money(toNumber(invoice.customer.creditLimitUsd), "USD")
            }
            outstandingLabel={null}
          />
        )}
      </div>
    );
  const heroUsd = paidInFull ? toNumber(invoice.total) : Math.max(0, outstanding);
  const heroLocal =
    invoiceRate === null ? null : toLocal(heroUsd, invoiceRate);

  /*
    A draft is the system's own working figure and must not leave the building.

    lib/auto-price raises every invoice as a DRAFT at Dar check-in, so this is
    the state Finance opens most often — and both ways of sending it out were
    offered here regardless. "Download PDF" is a plain <a>, so the route's
    honest 409 took the browser out of the app and onto a raw JSON body the
    user had to press Back to escape; "Notify on WhatsApp" had no draft guard at
    all and would have quoted the customer an unconfirmed total. The cargo
    screen already draws exactly this line (components/app/shipment-actions),
    so this page now agrees with it, and the route's 409 stays as the net
    behind both.
  */
  const isDraft = invoice.status === "DRAFT";
  /* A draft is nobody's demand for money, so the desk that raises bills may
     drop its own; a confirmed figure has been quoted to a customer, and taking
     that back is the owner's. Written-off bills belong to a closed statement,
     and a bill with money on it needs the payment cancelled first — both are
     refused by the action, and neither is offered a button here. */
  const canCancelBill =
    invoice.status !== "WRITTEN_OFF" &&
    invoice.status !== "VOID" &&
    toNumber(invoice.amountPaid) <= 0.005 &&
    (isDraft ? can(user.role, "invoice.manage") : can(user.role, "ledger.adjust"));

  // What this invoice was issued with, not what Settings says today.
  const accounts = accountsForInvoice(invoice.paymentSnapshot);
  /* The real company accounts a mis-recorded payment can be moved into — a
     different list from the customer-facing one above, which is a snapshot
     of payment instructions rather than live CompanyAccount rows. */
  const ledgerAccounts = await activeAccounts();

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
   * It ends with a link rather than the accounts, so it cannot drift from the
   * PDF or the public tracking page — there is only one copy of them now.
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
    /*
      THE INVOICE ITSELF, NOT A COPY OF IT.

      This message used to end with every payment account typed out. WhatsApp
      cannot carry a PDF through a wa.me link, so showing somebody their
      invoice meant retyping it — and the accounts underneath were a copy of
      the truth that goes stale the day one of them changes.

      The link is the invoice: the full bill, and the accounts to pay it into,
      current every time it is opened. One place to keep right.
    */
    ...(outstanding > 0
      ? [
          `*See the full invoice and how to pay:*`,
          trackLink(shipment.trackingNumber),
        ]
      : []),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        {/*
          "Back to cargo" named a category, not a record.

          This page has no PageHeader — the invoice document IS the page — so
          the same back link comes in on its own. It now carries the tracking
          number, which matters here more than anywhere else: an invoice is
          opened from the follow-up queue as often as from the consignment, and
          the shell's control reads /app/finance/invoices and therefore offers
          "Collections". Saying TX-000125 is the one thing the guess cannot do,
          so unlike the other detail pages this one is worth its row on a phone.
        */}
        <SmartBack
          fallbackHref={`/app/cargo/${shipment.trackingNumber}`}
          fallbackLabel={shipment.trackingNumber}
          className="min-w-0"
        />
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
                  {t(locale, "Notify on WhatsApp")}
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

      {/*
        Cash or credit, and the whole state of the credit in one strip.

        It sits above the price editor because it is a question about THIS bill
        that gets asked at the counter, and below the document because nobody
        decides it before reading the amount. A bill with no credit on it and a
        desk that cannot ask for any renders nothing at all — most consignments
        are paid before collection and the screen should not imply otherwise.
      */}
      {creditPanel ? <div className="mb-6">{creditPanel}</div> : null}

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

      {/* The way back out of a bill that should never have been raised —
          priced early, cargo registered twice, wrong customer picked. Offered
          only while there is nothing real attached to it: the action refuses a
          bill with live money, a standing pickup note or a closed flight, and
          re-checks the permission it is rendered behind. */}
      {canCancelBill ? (
        <div className="mb-6">
          <InvoiceVoid
            invoiceId={invoice.id}
            invoiceNumber={invoice.invoiceNumber}
            confirmed={!isDraft}
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
            /* The account, not the kind of account. A null simply drops out of
               the join below, so a payment taken before accounts were recorded
               degrades to one fewer fact rather than to the word "null". */
            payment.account?.name,
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
            <LedgerRowFix
              accounts={ledgerAccounts}
              subject={{
                entryId: payment.id,
                paymentId: payment.id,
                paymentReference: payment.reference,
                paymentNote: payment.note,
                paymentAccountId: payment.accountId,
                amount: toNumber(payment.amount),
                currency: payment.currency,
                /* A combined payment answers several bills; moving its figure
                   is the allocation screen's question, not this dialog's. The
                   anchor invoiceId is set on merged payments too, so the test
                   is how many bills it actually answered. */
                amountEditable:
                  payment.invoiceId !== null && payment._count.allocations <= 1,
                expenseId: null,
                expenseDescription: null,
                expenseCategory: null,
                expenseClass: null,
                expenseVendor: null,
                expenseNote: null,
                expenseAccountId: null,
                expenseBatchId: null,
                expenseIncurredAt: null,
                expenseStatus: null,
                attachments: payment.proofs,
                reversed: payment.voidedAt !== null,
                voidReason: payment.voidReason,
                voidedByName: payment.voidedBy?.name ?? null,
              }}
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
                  Just the price, in the customer's terms — and composed in the
                  one place that composes it, so this message and the reminder
                  chasing it cannot state the same rate two ways. It said
                  "USD 13.50/kg" here and the queue said nothing at all.
                */
                freightBasis: freightBasisOf(shipment),
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
