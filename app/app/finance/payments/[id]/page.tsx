import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeftRight,
  Banknote,
  FileText,
  Package,
  Paperclip,
  Receipt,
  Scale,
  User,
} from "lucide-react";

import { LedgerRowFix } from "@/components/app/ledger-row-fix";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { activeAccounts } from "@/lib/accounts";
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { localSplit, outstandingOf } from "@/lib/invoice-balance";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Payment") };
}

/** Bytes, in the units a person reads. */
function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One payment, opened.
 *
 * The register answers "was it taken"; this answers "prove it". Everything that
 * makes the payment defensible months later is on one screen: what was actually
 * handed over, what it settled and at which rate, which account received it,
 * who took it, and the evidence they were given — shown, not merely counted.
 *
 * The proofs are the point. A typed amount is a claim; the M-Pesa screenshot or
 * the bank slip is what ends an argument, and it was previously reachable
 * nowhere in the app after the moment it was uploaded.
 */
export default async function PaymentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("payment.record");
  const locale = await viewerLocale();
  const { id } = await params;
  const accounts = await activeAccounts();

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      /* One bill or several. A merged payment's figure cannot be corrected
         here — see changePaymentAmount. */
      _count: { select: { allocations: true } },
      receipt: true,
      account: { select: { id: true, name: true, currency: true } },
      /* The account the transport was paid out of — cash or the Lipa number.
         Without its name the record shows money leaving and cannot say from
         where, which is the one question asked when the till is counted. */
      transportSource: { select: { id: true, name: true } },
      receivedBy: { select: { name: true } },
      voidedBy: { select: { name: true } },
      /* Who actually raised this, when it arrived as a claim rather than
         being taken at the counter. Support's own credit for the work of
         collecting it must not vanish the moment Finance's name is the one
         that lands on the record. */
      submission: { select: { submittedBy: { select: { name: true } } } },
      proofs: {
        orderBy: { createdAt: "asc" },
        include: { uploadedBy: { select: { name: true } } },
      },
      /* Both legs: what came in, and the transport settled out of another
         account. The page shows each — a payment that moved two accounts and
         named one of them is a payment nobody can follow. */
      ledgerEntries: {
        orderBy: { direction: "asc" },
        select: {
          direction: true,
          kind: true,
          amount: true,
          currency: true,
          entryNumber: true,
          accountId: true,
          /* Whether this movement has already been answered — a reversed line
             has nothing left to correct. */
          reversedBy: { select: { id: true } },
        },
      },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          currency: true,
          total: true,
          amountPaid: true,
          amountAdjusted: true,
          exchangeRate: true,
          status: true,
          /* What actually arrived, in the money it arrived in — see
             localSplit. Without it the shilling figures are the dollar
             columns multiplied back out, and they do not match the button
             the desk pressed. */
          payments: { where: { voidedAt: null }, select: { amount: true, currency: true } },
          /* The write-offs on this bill, so the page can say how a payment
             short of the total nevertheless settled it. */
          adjustments: {
            where: { reversedAt: null },
            orderBy: { createdAt: "asc" },
            select: {
              amount: true,
              currency: true,
              reason: true,
              createdAt: true,
              paymentId: true,
              createdBy: { select: { name: true } },
            },
          },
          customer: { select: { id: true, name: true, phone: true } },
          shipment: {
            select: { trackingNumber: true, ...selectText("description") },
          },
        },
      },
    },
  });
  if (!payment) notFound();

  const tendered = toNumber(payment.amount);
  /* The half that was never the company's. Zero on every payment that is
     purely a bill being settled, which is nearly all of them. */
  const transport = toNumber(payment.transportAmount);
  const credited =
    payment.creditedAmount === null ? null : toNumber(payment.creditedAmount);
  const invoice = payment.invoice;
  const converted = payment.currency !== (invoice?.currency ?? payment.currency);
  /* Nothing is owing on a deposit — there is no bill for it to be owing on. */
  const owing = invoice
    ? outstandingOf(invoice)
    : 0;

  /*
    WHAT WAS CLEARED RATHER THAN PAID.

    A payment of TSh 36,000 settling a bill of TSh 36,450 read "Paid to date
    13.33 · Still owing 0" with nothing between them, so the page could not say
    why 13.33 settles 13.50. The owner's question, twice.

    It is NOT money and must never be added to one: it reaches no account, no
    ledger line and no total the business counts. It is a decision, recorded so
    the boss can see the customer was let off a figure too small to chase and
    the cargo went out honestly.
  */
  const cleared = invoice ? toNumber(invoice.amountAdjusted) : 0;
  const split = invoice
    ? localSplit(invoice)
    : { billLocal: null, paidLocal: null, clearedLocal: null };
  const clearedTsh =
    split.clearedLocal !== null
      ? `TSh ${split.clearedLocal.toLocaleString("en-US")}`
      : null;
  /* Only the ones decided with THIS payment — an adjustment made later on the
     bill's own page belongs to that page, not to this receipt. */
  const clearedHere = (invoice?.adjustments ?? []).filter(
    (a) => a.paymentId === payment.id
  );

  /* No "Method" row. It said "Mobile money" directly above a row naming the
     mobile-money account it went into — the same fact twice, the second time
     precisely. */
  const facts: { label: string; value: React.ReactNode }[] = [
    {
      label: t(locale, "Reference"),
      value: payment.reference ?? (
        <span className="text-muted-foreground">{t(locale, "none given")}</span>
      ),
    },
    {
      label: t(locale, "Landed in"),
      value: payment.account ? (
        <Link
          href={`/app/finance/accounts/${payment.account.id}`}
          className="hover:text-brand"
        >
          {payment.account.name}
        </Link>
      ) : (
        <span className="text-warning">{t(locale, "no account named")}</span>
      ),
    },
    /* Both names when there are two — the desk that collected it and the
       one that agreed it was real are different facts about this payment,
       and showing only the second makes the first desk's work invisible. */
    ...(payment.submission?.submittedBy
      ? [
          {
            label: t(locale, "Submitted by"),
            value: payment.submission.submittedBy.name,
          },
        ]
      : []),
    {
      label: t(locale, payment.submission ? "Confirmed by" : "Taken by"),
      value: payment.receivedBy?.name ?? "—",
    },
    { label: t(locale, "When"), value: formatDateTime(payment.paidAt, locale) },
    {
      label: t(locale, "Ledger line"),
      value: payment.ledgerEntries.length > 0 ? (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {payment.ledgerEntries.map((line) => (
            <Link
              key={line.entryNumber}
              href={`/app/finance/transactions?account=${line.accountId}`}
              className="font-mono text-xs hover:text-brand"
            >
              {line.entryNumber}
              {/* Named, because one of these is the customer's money arriving
                  and the other is the transport going out again. */}
              {line.kind === "TRANSPORT_OUT" ? (
                <span className="ml-1.5 font-sans text-[10px] text-muted-foreground">
                  {" "}
                  {t(locale, "transport")}
                </span>
              ) : null}
            </Link>
          ))}
        </span>
      ) : (
        <span className="text-warning">
          {t(locale, "none — no account was named")}
        </span>
      ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/*
          Falls back to the Ledger, not the old payments list — the Ledger is
          the only money page in the nav, and where this line usually opens
          from. The trail overrides it whenever there really is somewhere else
          the reader came from; backTo's label is a raw key, translated once
          by SmartBack itself.
        */}
        <PageHeader
          title={payment.receipt?.receiptNumber ?? t(locale, "Payment")}
          description={
            invoice
              ? `${invoice.customer.name} · ${invoice.shipment.trackingNumber}`
              : t(locale, "Customer deposit")
          }
          backTo={{ href: "/app/finance/transactions", label: "The Ledger" }}
        />
        {/*
          Correct it and cancel it, on the record itself.

          Somebody who has opened a payment to look at it is exactly the person
          about to fix it, and sending them back to the register to find the row
          they just left is the long way round to the same act. Same two
          controls, same gate: ledger.adjust, which is Finance, Manager and the
          owner — recording money and un-recording it are different authorities.
        */}
        {can(user.role, "ledger.adjust") ? (
          <div className="pt-1">
            <LedgerRowFix
              accounts={accounts}
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
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_1fr]">
        <div className="space-y-6">
          {/* What was actually handed over, and what it settled. Both, because
              the customer counted one of them and the bill moved by the other. */}
          <section className="rounded-2xl border bg-card p-6">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              <Banknote className="h-4 w-4 text-success" />
              {t(locale, "Handed over")}
            </p>
            <p className="mt-2 font-display text-[36px] font-bold leading-none tracking-tight tabular-nums">
              {formatMoney(tendered, payment.currency)}
            </p>
            {converted && credited !== null ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t(locale, "Settled")}{" "}
                {/* In the BILL's own currency — `credited` is what the bill
                    moved by, and a bill is only ever settled in its own
                    money. Labelled USD regardless, this read as dollars on
                    every shilling-denominated bill. */}
                {formatMoney(credited, invoice?.currency ?? payment.currency)}{" "}
                {t(locale, "against the bill")}
                {payment.exchangeRate
                  ? `, ${t(locale, "at")} ${toNumber(payment.exchangeRate).toLocaleString()} ${t(locale, "to the dollar")}`
                  : ""}
                .{" "}
                {t(
                  locale,
                  "The rate was frozen onto the invoice when it was raised, so this figure cannot move later."
                )}
              </p>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {t(locale, "Paid in the same currency the bill was raised in.")}
              </p>
            )}

            {/*
              THE CUSTOMER PAID CARGO PLUS TRANSPORT, AND THE RECORD SAYS SO.

              The figure above is everything that arrived in one transfer. Only
              part of it was the company's — the rest was the delivery, which is
              collected on somebody else's behalf and paid straight out again.

              Anyone reading this record later, with nothing but the screen and
              a customer on the phone, has to be able to answer three questions:
              how much came in, how much of it settled the bill, and where the
              rest went. Leaving it as one number makes the payment look like an
              overpayment on the bill, and the transport look like income.
            */}
            {transport > 0 ? (
              <div className="mt-4 rounded-xl border border-warning/30 bg-warning/[0.06] p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-warning">
                  {t(locale, "Cargo plus transport")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t(
                    locale,
                    "The customer sent one amount covering the cargo and the delivery."
                  )}
                </p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">{t(locale, "Cargo charge")}</dt>
                    <dd className="font-semibold tabular-nums">
                      {formatMoney(tendered - transport, payment.currency)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-muted-foreground">
                      {t(locale, "Transport (passed on)")}
                    </dt>
                    <dd className="font-semibold tabular-nums text-warning">
                      {formatMoney(transport, payment.currency)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 border-t pt-1.5">
                    <dt className="font-medium">{t(locale, "Total received")}</dt>
                    <dd className="font-bold tabular-nums">
                      {formatMoney(tendered, payment.currency)}
                    </dd>
                  </div>
                </dl>
                {payment.transportSource ? (
                  <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
                    {t(locale, "Settled from")}{" "}
                    <Link
                      href={`/app/finance/accounts/${payment.transportSource.id}`}
                      className="font-medium hover:text-brand"
                    >
                      {payment.transportSource.name}
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : null}

            <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 border-t pt-4 sm:grid-cols-2">
              {facts.map((fact) => (
                <div key={fact.label}>
                  <dt className="text-xs text-muted-foreground">{fact.label}</dt>
                  <dd className="mt-0.5 text-sm font-medium">{fact.value}</dd>
                </div>
              ))}
            </dl>

            {payment.note ? (
              <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {payment.note}
              </p>
            ) : null}
          </section>

          {/*
            THE DIFFERENCE THAT WAS LET GO — ON THE RECORD, COUNTED NOWHERE.

            The whole point of clearing a small difference is that the customer
            gets their cargo and nobody chases 450 shillings. The point of THIS
            panel is that the decision is not invisible afterwards: the boss can
            see what was let go, who let it go and when, on the same page as the
            money that did arrive.

            It is deliberately not money. It reaches no account, writes no
            ledger line, and is not a part payment of anything — the bill is
            settled, not partly settled. This is a reference, and it says so.
          */}
          {clearedHere.length > 0 ? (
            <section className="rounded-2xl border border-warning/40 bg-warning/[0.06] p-5">
              <h2 className="flex items-center gap-2 font-semibold text-warning">
                <Scale className="h-4 w-4" />
                {t(locale, "Cleared with this payment")}
              </h2>
              <dl className="mt-4 space-y-3 text-sm">
                {clearedHere.map((a, i) => {
                  const amount = toNumber(a.amount);
                  return (
                    <div
                      key={i}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"
                    >
                      <dt className="text-muted-foreground">
                        {t(locale, "Written off the bill")}
                        <span className="mt-0.5 block text-xs">
                          {t(locale, "by")} {a.createdBy?.name ?? "—"} ·{" "}
                          {formatDateTime(a.createdAt, locale)}
                          {a.reason ? ` · ${a.reason}` : ""}
                        </span>
                      </dt>
                      <dd className="font-mono font-semibold tabular-nums text-warning">
                        {clearedHere.length === 1 && clearedTsh
                          ? clearedTsh
                          : formatMoney(amount, a.currency)}
                        <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                          {formatMoney(amount, a.currency)}
                        </span>
                      </dd>
                    </div>
                  );
                })}
              </dl>
              <p className="mt-4 border-t border-warning/25 pt-3 text-xs text-muted-foreground">
                {t(
                  locale,
                  "This is a record, not money. It reached no account, wrote no ledger line, and counts towards no total — the bill is settled, not part paid. It is here so the decision can be found."
                )}
              </p>
            </section>
          ) : null}

          {/* The evidence. Shown, not counted — it existed in the database and
              was reachable from nowhere once uploaded. */}
          <section className="rounded-2xl border bg-card">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
              <h2 className="flex items-center gap-2 font-semibold">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                {t(locale, "Proof of payment")}
              </h2>
              <span className="text-xs text-muted-foreground">
                {payment.proofs.length === 0
                  ? t(locale, "nothing attached")
                  : `${payment.proofs.length} ${t(locale, payment.proofs.length === 1 ? "file" : "files")}`}
              </span>
            </div>

            {payment.proofs.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                {t(
                  locale,
                  "No slip or screenshot was attached to this payment. The typed reference is the only record that it happened — worth chasing while the customer still has theirs."
                )}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-2">
                {payment.proofs.map((proof) => {
                  const isImage = proof.contentType.startsWith("image/");
                  return (
                    <li key={proof.id}>
                      <a
                        href={proof.url}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-ring block overflow-hidden rounded-xl border transition-colors hover:border-foreground/25"
                      >
                        {isImage ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={proof.url}
                            alt={proof.filename ?? t(locale, "Proof of payment")}
                            className="h-44 w-full bg-muted object-cover"
                          />
                        ) : (
                          <span className="flex h-44 w-full items-center justify-center bg-muted">
                            <FileText className="h-11 w-10 text-muted-foreground" />
                          </span>
                        )}
                        <span className="block px-3 py-2">
                          <span className="block truncate text-xs font-medium">
                            {proof.filename ?? t(locale, "Attachment")}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {fileSize(proof.bytes)}
                            {proof.uploadedBy
                              ? ` · ${proof.uploadedBy.name}`
                              : ""}
                          </span>
                        </span>
                      </a>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {/*
            A deposit has no bill and no cargo yet — that is what makes it a
            deposit. Rather than print empty rows where an invoice and a
            tracking number belong, the two panels stand down and the page
            says what this money actually is.
          */}
          {invoice ? (
            <>
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                {t(locale, "The bill")}
              </h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">{t(locale, "Invoice")}</dt>
                  <dd>
                    <Link
                      href={`/app/finance/invoices/${invoice.id}`}
                      className="font-mono text-xs hover:text-brand"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">{t(locale, "Total")}</dt>
                  <dd className="font-mono tabular-nums">
                    {formatMoney(toNumber(invoice.total), invoice.currency)}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-muted-foreground">
                    {t(locale, "Paid to date")}
                  </dt>
                  <dd className="font-mono tabular-nums">
                    {formatMoney(toNumber(invoice.amountPaid), invoice.currency)}
                  </dd>
                </div>
                {cleared > 0.005 ? (
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-muted-foreground">
                      {t(locale, "Cleared, not paid")}
                    </dt>
                    <dd className="font-mono tabular-nums text-warning">
                      {clearedTsh ?? formatMoney(cleared, invoice.currency)}
                      <span className="ml-1.5 text-[11px] text-muted-foreground">
                        {formatMoney(cleared, invoice.currency)}
                      </span>
                    </dd>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between gap-3 border-t pt-3">
                  <dt className="font-medium">{t(locale, "Still owing")}</dt>
                  <dd
                    className={`font-mono font-semibold tabular-nums ${
                      owing > 0 ? "text-warning" : "text-success"
                    }`}
                  >
                    {formatMoney(owing, invoice.currency)}
                  </dd>
                </div>
              </dl>
              <Badge variant="outline" className="mt-3 font-normal">
                {t(locale, invoice.status.replace("_", " ").toLowerCase())}
              </Badge>
            </section>
  
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <User className="h-4 w-4 text-muted-foreground" />
                {t(locale, "Customer")}
              </h2>
              <p className="mt-3 text-sm font-medium">
                <Link
                  href={`/app/customers/${invoice.customer.id}`}
                  className="hover:text-brand"
                >
                  {invoice.customer.name}
                </Link>
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {invoice.customer.phone}
              </p>
  
              <h2 className="mt-5 flex items-center gap-2 font-semibold">
                <Package className="h-4 w-4 text-muted-foreground" />
                {t(locale, "Cargo")}
              </h2>
              <p className="mt-3 text-sm">
                <Link
                  href={`/app/cargo/${invoice.shipment.trackingNumber}`}
                  className="font-mono hover:text-brand"
                >
                  {invoice.shipment.trackingNumber}
                </Link>
              </p>
              <p className="text-xs text-muted-foreground">
                {cargoText(locale, invoice.shipment, "description")}
              </p>
            </section>
            </>
          ) : (
            <section className="rounded-2xl border border-warning/40 bg-warning/5 p-5">
              <h2 className="font-semibold">{t(locale, "Held as customer credit")}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(locale, "This money arrived before the cargo landed, so there is no bill against it yet. It settles the customer's invoice by itself the moment Dar checks their cargo in.")}
              </p>
            </section>
          )}

          {!payment.account ? (
            <section className="rounded-2xl border border-warning/40 bg-warning/5 p-5">
              <h2 className="flex items-center gap-2 font-semibold">
                <ArrowLeftRight className="h-4 w-4 text-warning" />
                {t(locale, "Not in an account")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {t(
                  locale,
                  "Nobody said where this money went, so it has no line in the register and no account carries it. Say where it landed on the payments list and it settles itself."
                )}
              </p>
              <Link
                href="/app/finance/payments"
                className="mt-3 inline-block text-xs font-medium text-brand hover:underline"
              >
                {t(locale, "Fix it on the register →")}
              </Link>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
