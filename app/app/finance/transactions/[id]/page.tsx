import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { FileText, Paperclip } from "lucide-react";

import { LedgerRowFix } from "@/components/app/ledger-row-fix";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { activeAccounts } from "@/lib/accounts";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses";
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
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
  const user = await requirePermission("ledger.view");
  const locale = await viewerLocale();
  const { id } = await params;
  const accounts = await activeAccounts();

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

  /* Correcting the register is the one permission the owner deliberately gave
     Finance as well as himself — see ledger.adjust in rbac.ts. */
  const canFix = can(user.role, "ledger.adjust");

  const inbound = entry.direction === "IN";

  /*
    A SECOND CORRECTION LOSES ITS DIRECT LINE TO THE EXPENSE.

    LedgerEntry.expenseId is unique — one line per cost — so the line a
    correction posts links back to it only through sourceEntity/sourceId, and
    entry.expense, keyed on expenseId, comes back null for that line. Opening
    a correction line directly must not read as "no cost behind this" —
    resolved by hand for exactly the case the direct relation misses.
  */
  const expense =
    entry.expense ??
    (entry.sourceEntity === "Expense" && entry.sourceId
      ? await prisma.expense.findUnique({
          where: { id: entry.sourceId },
          include: {
            receipts: {
              orderBy: { createdAt: "asc" },
              include: { uploadedBy: { select: { name: true } } },
            },
            approvedBy: { select: { name: true } },
            batch: { select: { id: true, batchNumber: true } },
          },
        })
      : null);
  const receipts = expense?.receipts ?? [];

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
    { label: "When the money moved", value: formatDateTime(entry.occurredAt, locale) },
    { label: "Recorded by", value: entry.recordedBy?.name ?? "—" },
    {
      label: "Written",
      value: formatDateTime(entry.createdAt, locale),
    },
  ];

  if (expense) {
    facts.push(
      {
        label: "Category",
        value: t(
          locale,
          EXPENSE_CATEGORY_LABELS[expense.category] ??
            expense.category
        ),
      },
      { label: "Paid to", value: expense.vendor ?? "—" },
      {
        label: "Cost incurred",
        value: formatDateTime(expense.incurredAt, locale),
      }
    );
    if (expense.batch) {
      facts.push({
        label: "Against dispatch",
        value: (
          <Link
            href={`/app/batches/${expense.batch.id}`}
            className="font-mono text-xs hover:text-brand"
          >
            {expense.batch.batchNumber}
          </Link>
        ),
      });
    }
    if (expense.approvedBy) {
      facts.push({ label: "Approved by", value: expense.approvedBy.name });
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* backTo's label is a raw key — SmartBack translates it once itself. */}
        <PageHeader
          title={expense?.description ?? entry.description}
          description={`${t(locale, KIND_LABEL[entry.kind] ?? entry.kind)} · ${entry.account.name}`}
          backTo={{ href: "/app/finance/transactions", label: "The Ledger" }}
        />
        {/*
          The same two controls the register carries, on the record itself.

          Somebody who has opened a movement to look at it is exactly the person
          about to correct it, and sending them back to the list to find the row
          they just left is the long way round to the same act.
        */}
        {canFix ? (
          <div className="pt-1">
            <LedgerRowFix
              accounts={accounts}
              subject={{
                entryId: entry.id,
                /* A payment movement is redirected to the payment's own page
                   above, so what reaches here is a cost or a plain transfer. */
                paymentId: null,
                paymentReference: null,
                paymentNote: null,
                paymentMethod: null,
                paymentAccountId: null,
                amount: toNumber(entry.amount),
                currency: entry.currency,
                amountEditable: false,
                expenseId: expense?.id ?? null,
                expenseDescription: expense?.description ?? null,
                expenseCategory: expense?.category ?? null,
                expenseClass: expense?.expenseClass ?? null,
                expenseVendor: expense?.vendor ?? null,
                expenseNote: expense?.note ?? null,
                expenseAccountId: expense?.accountId ?? null,
                expenseBatchId: expense?.batchId ?? null,
                expenseIncurredAt: expense
                  ? expense.incurredAt.toISOString().slice(0, 10)
                  : null,
                expenseStatus: expense?.status ?? null,
                attachments: expense?.receipts ?? [],
                reversed: Boolean(entry.reversedBy || entry.reverses),
                voidReason: null,
                voidedByName: null,
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_1fr]">
        <section className="rounded-2xl border bg-card p-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
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

          <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-4 border-t pt-5 sm:grid-cols-2">
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
                {expense
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
                            <FileText className="h-11 w-10 text-muted-foreground" />
                          </span>
                        )}
                        <span className="block px-3 py-2">
                          <span className="block truncate text-xs font-medium">
                            {receipt.filename ?? t(locale, "Attachment")}
                          </span>
                          <span className="block text-xs text-muted-foreground">
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
                "A wrong line is put right rather than removed: Edit or Cancel above corrects it here, on this line, rather than sending you to find the document behind it. Both leave the register able to explain the balance."
              )}
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
