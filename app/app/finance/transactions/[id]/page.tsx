import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, FileText, Paperclip } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses";
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Ledger entry" };

const KIND_LABEL: Record<string, string> = {
  OPENING_BALANCE: "Opening balance",
  CUSTOMER_PAYMENT: "Freight payment",
  EXPENSE: "Expense",
  COMPENSATION: "Compensation",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  ADJUSTMENT: "Adjustment",
};

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * One line of the register, opened.
 *
 * Whatever the line is — a payment, a cost, a transfer, an opening figure —
 * this shows the movement itself and then the document behind it, with its
 * attachments. One page rather than three, because from the register's point of
 * view they are the same thing: money moved, and here is the paper that says so.
 *
 * A freight payment has a richer story than a ledger line can hold — the bill,
 * the cargo, the customer — so it hands over to the payment page rather than
 * reproducing half of it here.
 */
export default async function LedgerEntryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("ledger.view");
  const locale = await viewerLocale();
  const { id } = await params;

  const entry = await prisma.ledgerEntry.findUnique({
    where: { id },
    include: {
      account: { select: { id: true, name: true, currency: true } },
      recordedBy: { select: { name: true } },
      payment: { select: { id: true } },
      expense: {
        include: {
          receipts: {
            orderBy: { createdAt: "asc" },
            include: { uploadedBy: { select: { name: true } } },
          },
          approvedBy: { select: { name: true } },
          batch: { select: { id: true, batchNumber: true } },
        },
      },
      transfer: {
        include: {
          fromAccount: { select: { id: true, name: true } },
          toAccount: { select: { id: true, name: true } },
        },
      },
      reverses: { select: { id: true, entryNumber: true } },
      reversedBy: { select: { id: true, entryNumber: true } },
    },
  });
  if (!entry) notFound();

  // A payment's own page already tells the fuller story.
  if (entry.payment) redirect(`/app/finance/payments/${entry.payment.id}`);

  const inbound = entry.direction === "IN";
  const receipts = entry.expense?.receipts ?? [];

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: "Entry", value: <span className="font-mono text-xs">{entry.entryNumber}</span> },
    { label: "Type", value: t(locale, KIND_LABEL[entry.kind] ?? entry.kind) },
    {
      label: "Account",
      value: (
        <Link
          href={`/app/finance/accounts/${entry.account.id}`}
          className="hover:text-brand"
        >
          {entry.account.name}
        </Link>
      ),
    },
    { label: "When the money moved", value: formatDateTime(entry.occurredAt) },
    { label: "Recorded by", value: entry.recordedBy?.name ?? "—" },
    {
      label: "Written",
      value: formatDateTime(entry.createdAt),
    },
  ];

  if (entry.expense) {
    facts.push(
      {
        label: "Category",
        value: t(
          locale,
          EXPENSE_CATEGORY_LABELS[entry.expense.category] ??
            entry.expense.category
        ),
      },
      { label: "Paid to", value: entry.expense.vendor ?? "—" },
      {
        label: "Cost incurred",
        value: formatDateTime(entry.expense.incurredAt),
      }
    );
    if (entry.expense.batch) {
      facts.push({
        label: "Against dispatch",
        value: (
          <Link
            href={`/app/batches/${entry.expense.batch.id}`}
            className="font-mono text-xs hover:text-brand"
          >
            {entry.expense.batch.batchNumber}
          </Link>
        ),
      });
    }
    if (entry.expense.approvedBy) {
      facts.push({ label: "Approved by", value: entry.expense.approvedBy.name });
    }
  }

  if (entry.transfer) {
    facts.push(
      {
        label: "Out of",
        value: (
          <Link
            href={`/app/finance/accounts/${entry.transfer.fromAccount.id}`}
            className="hover:text-brand"
          >
            {entry.transfer.fromAccount.name}
          </Link>
        ),
      },
      {
        label: "Into",
        value: (
          <Link
            href={`/app/finance/accounts/${entry.transfer.toAccount.id}`}
            className="hover:text-brand"
          >
            {entry.transfer.toAccount.name}
          </Link>
        ),
      },
      {
        label: "Bank charge",
        value:
          toNumber(entry.transfer.fee) > 0
            ? formatMoney(toNumber(entry.transfer.fee), entry.currency)
            : t(locale, "none"),
      }
    );
  }

  return (
    <>
      <Link
        href="/app/finance/transactions"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t(locale, "The Ledger")}
      </Link>

      <PageHeader
        title={entry.expense?.description ?? entry.description}
        description={`${t(locale, KIND_LABEL[entry.kind] ?? entry.kind)} · ${entry.account.name}`}
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-2xl border bg-card p-6">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            {inbound ? t(locale, "Money in") : t(locale, "Money out")}
          </p>
          <p
            className={`mt-2 font-display text-[36px] font-bold leading-none tracking-tight tabular-nums ${
              inbound ? "text-success" : "text-destructive"
            }`}
          >
            {inbound ? "+" : "−"}
            {formatMoney(toNumber(entry.amount), entry.currency)}
          </p>
          {entry.currency === "USD" ? null : (
            <p className="mt-1.5 font-mono text-xs text-muted-foreground">
              {formatUsd(toNumber(entry.amountUsd))}
              {entry.exchangeRate
                ? ` ${t(locale, "at")} ${toNumber(entry.exchangeRate).toLocaleString()} ${t(locale, "to the dollar")}`
                : ""}
            </p>
          )}

          <dl className="mt-6 grid gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-2">
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-xs text-muted-foreground">
                  {t(locale, fact.label)}
                </dt>
                <dd className="mt-0.5 text-sm font-medium">{fact.value}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-6 border-t pt-4 text-xs text-muted-foreground">
            {entry.description}
          </p>
        </section>

        <div className="space-y-6">
          <section className="rounded-2xl border bg-card">
            <div className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
              <h2 className="flex items-center gap-2 font-semibold">
                <Paperclip className="h-4 w-4 text-muted-foreground" />
                {t(locale, "Attachments")}
              </h2>
              <span className="text-xs text-muted-foreground">
                {receipts.length === 0
                  ? t(locale, "none")
                  : `${receipts.length} ${
                      receipts.length === 1
                        ? t(locale, "file")
                        : t(locale, "files")
                    }`}
              </span>
            </div>

            {receipts.length === 0 ? (
              <p className="px-5 py-6 text-sm text-muted-foreground">
                {entry.expense
                  ? t(
                      locale,
                      "No receipt was attached to this cost. The typed amount is the only record that it happened."
                    )
                  : t(locale, "This kind of movement carries no attachment.")}
              </p>
            ) : (
              <ul className="space-y-3 p-5">
                {receipts.map((receipt) => {
                  const isImage = receipt.contentType.startsWith("image/");
                  return (
                    <li key={receipt.id}>
                      <a
                        href={receipt.url}
                        target="_blank"
                        rel="noreferrer"
                        className="focus-ring block overflow-hidden rounded-xl border transition-colors hover:border-foreground/25"
                      >
                        {isImage ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={receipt.url}
                            alt={receipt.filename ?? t(locale, "Receipt")}
                            className="h-40 w-full bg-muted object-cover"
                          />
                        ) : (
                          <span className="flex h-40 w-full items-center justify-center bg-muted">
                            <FileText className="h-10 w-10 text-muted-foreground" />
                          </span>
                        )}
                        <span className="block px-3 py-2">
                          <span className="block truncate text-xs font-medium">
                            {receipt.filename ?? t(locale, "Attachment")}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {fileSize(receipt.bytes)}
                            {receipt.uploadedBy
                              ? ` · ${receipt.uploadedBy.name}`
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

          {/* The register is append-only, so a correction is another line that
              points at this one. Both directions are shown. */}
          {entry.reverses || entry.reversedBy ? (
            <section className="rounded-2xl border border-warning/40 bg-warning/5 p-5">
              <h2 className="font-semibold">{t(locale, "Corrections")}</h2>
              {entry.reversedBy ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t(locale, "This line was cancelled by")}{" "}
                  <Link
                    href={`/app/finance/transactions/${entry.reversedBy.id}`}
                    className="font-mono text-xs text-brand hover:underline"
                  >
                    {entry.reversedBy.entryNumber}
                  </Link>
                  .
                </p>
              ) : null}
              {entry.reverses ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  {t(locale, "This line cancels")}{" "}
                  <Link
                    href={`/app/finance/transactions/${entry.reverses.id}`}
                    className="font-mono text-xs text-brand hover:underline"
                  >
                    {entry.reverses.entryNumber}
                  </Link>
                  .
                </p>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-2xl border bg-card p-5">
            <h2 className="font-semibold">{t(locale, "Where it sits")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t(locale, "This line is part of")}{" "}
              <Link
                href={`/app/finance/transactions?account=${entry.account.id}`}
                className="text-brand hover:underline"
              >
                {entry.account.name}
                {t(locale, "’s running balance")}
              </Link>
              .{" "}
              {t(
                locale,
                "Nothing here can be edited — a wrong line is cancelled by a reversing one, so the register keeps both what was believed and what corrected it."
              )}
            </p>
            <Badge variant="outline" className="mt-3 font-normal">
              {t(locale, "append-only")}
            </Badge>
          </section>
        </div>
      </div>
    </>
  );
}
