import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  ArrowLeftRight,
  Banknote,
  FileText,
  Package,
  Paperclip,
  Receipt,
  User,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
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

  const payment = await prisma.payment.findUnique({
    where: { id },
    include: {
      receipt: true,
      account: { select: { id: true, name: true, currency: true } },
      receivedBy: { select: { name: true } },
      proofs: {
        orderBy: { createdAt: "asc" },
        include: { uploadedBy: { select: { name: true } } },
      },
      ledgerEntry: { select: { entryNumber: true, accountId: true } },
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          currency: true,
          total: true,
          amountPaid: true,
          status: true,
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
  const credited =
    payment.creditedAmount === null ? null : toNumber(payment.creditedAmount);
  const converted = payment.currency !== payment.invoice.currency;
  const owing =
    toNumber(payment.invoice.total) - toNumber(payment.invoice.amountPaid);

  const facts: { label: string; value: React.ReactNode }[] = [
    {
      label: t(locale, "Method"),
      value: t(locale, PAYMENT_METHOD_LABELS[payment.method]),
    },
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
    { label: t(locale, "Taken by"), value: payment.receivedBy?.name ?? "—" },
    { label: t(locale, "When"), value: formatDateTime(payment.paidAt, locale) },
    {
      label: t(locale, "Ledger line"),
      value: payment.ledgerEntry ? (
        <Link
          href={`/app/finance/transactions?account=${payment.ledgerEntry.accountId}`}
          className="font-mono text-xs hover:text-brand"
        >
          {payment.ledgerEntry.entryNumber}
        </Link>
      ) : (
        <span className="text-warning">
          {t(locale, "none — no account was named")}
        </span>
      ),
    },
  ];

  return (
    <>
      {/* Back to the register, not to the old payments list: the Ledger is
          where this line was opened from and the only money page in the nav. */}
      <Link
        href="/app/finance/transactions"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t(locale, "The Ledger")}
      </Link>

      <PageHeader
        title={payment.receipt?.receiptNumber ?? t(locale, "Payment")}
        description={`${payment.invoice.customer.name} · ${payment.invoice.shipment.trackingNumber}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          {/* What was actually handed over, and what it settled. Both, because
              the customer counted one of them and the bill moved by the other. */}
          <section className="rounded-2xl border bg-card p-6">
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <Banknote className="h-4 w-4 text-success" />
              {t(locale, "Handed over")}
            </p>
            <p className="mt-2 font-display text-[36px] font-bold leading-none tracking-tight tabular-nums">
              {formatMoney(tendered, payment.currency)}
            </p>
            {converted && credited !== null ? (
              <p className="mt-2 text-sm text-muted-foreground">
                {t(locale, "Settled")} {formatUsd(credited)}{" "}
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

            <dl className="mt-5 grid gap-x-6 gap-y-4 border-t pt-4 sm:grid-cols-2">
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
              <ul className="grid gap-3 p-5 sm:grid-cols-2">
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
                            <FileText className="h-10 w-10 text-muted-foreground" />
                          </span>
                        )}
                        <span className="block px-3 py-2">
                          <span className="block truncate text-xs font-medium">
                            {proof.filename ?? t(locale, "Attachment")}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
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
                    href={`/app/finance/invoices/${payment.invoice.id}`}
                    className="font-mono text-xs hover:text-brand"
                  >
                    {payment.invoice.invoiceNumber}
                  </Link>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">{t(locale, "Total")}</dt>
                <dd className="font-mono tabular-nums">
                  {formatUsd(toNumber(payment.invoice.total))}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-muted-foreground">
                  {t(locale, "Paid to date")}
                </dt>
                <dd className="font-mono tabular-nums">
                  {formatUsd(toNumber(payment.invoice.amountPaid))}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 border-t pt-3">
                <dt className="font-medium">{t(locale, "Still owing")}</dt>
                <dd
                  className={`font-mono font-semibold tabular-nums ${
                    owing > 0 ? "text-warning" : "text-success"
                  }`}
                >
                  {formatUsd(owing)}
                </dd>
              </div>
            </dl>
            <Badge variant="outline" className="mt-3 font-normal">
              {t(locale, payment.invoice.status.replace("_", " ").toLowerCase())}
            </Badge>
          </section>

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="flex items-center gap-2 font-semibold">
              <User className="h-4 w-4 text-muted-foreground" />
              {t(locale, "Customer")}
            </h2>
            <p className="mt-3 text-sm font-medium">
              <Link
                href={`/app/customers/${payment.invoice.customer.id}`}
                className="hover:text-brand"
              >
                {payment.invoice.customer.name}
              </Link>
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {payment.invoice.customer.phone}
            </p>

            <h2 className="mt-5 flex items-center gap-2 font-semibold">
              <Package className="h-4 w-4 text-muted-foreground" />
              {t(locale, "Cargo")}
            </h2>
            <p className="mt-3 text-sm">
              <Link
                href={`/app/cargo/${payment.invoice.shipment.trackingNumber}`}
                className="font-mono hover:text-brand"
              >
                {payment.invoice.shipment.trackingNumber}
              </Link>
            </p>
            <p className="text-xs text-muted-foreground">
              {cargoText(locale, payment.invoice.shipment, "description")}
            </p>
          </section>

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
