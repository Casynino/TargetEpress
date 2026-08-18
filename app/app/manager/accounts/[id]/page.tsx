import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Building2, Smartphone, Wallet } from "lucide-react";

import { ReconcileForm } from "@/components/app/reconcile-form";
import { reconciliationHistory } from "@/lib/control";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatRelative,
  toNumber,
} from "@/lib/format";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { accountBalances } from "@/lib/ledger";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Account check" };

const KIND_ICON = {
  BANK: Building2,
  MOBILE_MONEY: Smartphone,
  CASH: Wallet,
} as const;

const KIND_LABEL = {
  BANK: "Bank account",
  MOBILE_MONEY: "Mobile money",
  CASH: "Cash",
} as const;

/** How each verdict reads in a history row, and in what tone. */
const STATE_TEXT: Record<string, { label: string; tone: string }> = {
  RECONCILED: { label: "matched", tone: "text-success" },
  MISMATCH: { label: "did not match", tone: "text-destructive" },
  UNDER_REVIEW: { label: "under review", tone: "text-warning" },
  SENT_BACK: { label: "sent back", tone: "text-warning" },
  PENDING: { label: "pending", tone: "text-muted-foreground" },
};

/**
 * One account, ready to be checked: the ledger's recent movements beside the
 * form that records what the outside world says.
 *
 * The transactions are here because reconciling is done line by line against a
 * statement, and sending the manager to another screen to see the lines would
 * mean two windows for one job. Each line names its source document and links
 * to it, so a figure that will not balance can be walked back to the receipt
 * or the expense that made it.
 *
 * Everything is in the account's OWN currency. The statement this page is
 * checked against is denominated in it; converting anything here would
 * manufacture differences out of the exchange rate.
 */
export default async function ManagerAccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("account.view");
  const locale = await viewerLocale();
  const { id } = await params;

  const account = await prisma.companyAccount.findUnique({ where: { id } });
  if (!account) notFound();

  const [balances, history, entries] = await Promise.all([
    accountBalances(prisma),
    reconciliationHistory(account.id),
    prisma.ledgerEntry.findMany({
      where: { accountId: account.id },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 30,
      include: {
        recordedBy: { select: { name: true } },
        payment: {
          select: {
            receipt: { select: { receiptNumber: true } },
            invoice: {
              select: {
                customer: { select: { name: true } },
                shipment: { select: { trackingNumber: true } },
              },
            },
          },
        },
        expense: { select: { expenseNumber: true, vendor: true } },
        transfer: {
          select: {
            transferNumber: true,
            fromAccount: { select: { name: true } },
            toAccount: { select: { name: true } },
          },
        },
      },
    }),
  ]);

  const movement = balances.find((row) => row.accountId === account.id);
  const inflow = toNumber(movement?.inflow ?? 0);
  const outflow = toNumber(movement?.outflow ?? 0);
  const net = inflow - outflow;
  const money = (n: number) => formatMoney(n, account.currency);

  const canReconcile = can(user.role, "account.reconcile");
  const Icon = KIND_ICON[account.kind];
  const lastCheck = history[0] ?? null;

  /*
    Where the last check falls inside the visible register.

    "The ledger has moved since" is a sentence; showing WHERE it moved is a
    line drawn through the list. Entries above the rule are outside the last
    check, entries below are covered by it — measured against the moment the
    check was ABOUT (asOf), not when it was typed, because a Wednesday check
    of Monday's close covers nothing that happened on Tuesday.
  */
  const ruleAt = lastCheck
    ? entries.findIndex((entry) => entry.occurredAt <= lastCheck.asOf)
    : -1;

  return (
    <>
      <Link
        href="/app/manager/accounts"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t(locale, "All accounts")}
      </Link>

      {/* The account and its position, one dense band. The number a statement
          is compared against belongs at the top, in the account's currency,
          with the account number the statement will carry. */}
      <section className="mb-4 rounded-xl border bg-card p-3">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-muted-foreground">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate font-display text-lg font-bold leading-tight">
                {account.name}
                {!account.active ? (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {t(locale, "archived")}
                  </span>
                ) : null}
              </h1>
              <p className="text-[11px] text-muted-foreground">
                {t(locale, KIND_LABEL[account.kind])}
                {account.accountNumber ? (
                  <span className="font-mono"> · {account.accountNumber}</span>
                ) : null}
                {account.accountName ? ` · ${account.accountName}` : ""}
              </p>
            </div>
          </div>

          <dl className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t(locale, "The ledger says")}
              </dt>
              <dd className="tabular font-display text-2xl font-bold leading-none">
                {money(net)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t(locale, "Money in")}
              </dt>
              <dd className="tabular text-sm font-semibold text-success">
                {money(inflow)}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t(locale, "Money out")}
              </dt>
              <dd className="tabular text-sm font-semibold">{money(outflow)}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {t(locale, "Last checked")}
              </dt>
              <dd
                className={`text-sm font-semibold ${
                  lastCheck ? "" : "text-warning"
                }`}
              >
                {lastCheck
                  ? formatRelative(lastCheck.asOf, locale)
                  : t(locale, "never")}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        {/* The register, newest first, each line carrying its source document. */}
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t(locale, "Recent movements")}
          </h2>
          {entries.length === 0 ? (
            <p className="rounded-xl border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
              {t(
                locale,
                "Nothing has moved through this account yet, so there is nothing to check a statement against."
              )}
            </p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {entries.map((entry, index) => {
                const inbound = entry.direction === "IN";
                const detail = entry.payment
                  ? entry.payment.invoice.customer.name
                  : entry.expense
                    ? (entry.expense.vendor ?? entry.description)
                    : entry.transfer
                      ? inbound
                        ? `${t(locale, "In from")} ${entry.transfer.fromAccount.name}`
                        : `${t(locale, "Out to")} ${entry.transfer.toAccount.name}`
                      : entry.description;
                /* The document behind the line — receipt, expense or transfer
                   number — which is what a bank statement is matched against. */
                const sourceRef =
                  entry.payment?.receipt?.receiptNumber ??
                  entry.expense?.expenseNumber ??
                  entry.transfer?.transferNumber ??
                  entry.entryNumber;
                const tracking =
                  entry.payment?.invoice.shipment.trackingNumber ?? null;

                return (
                  <li key={entry.id}>
                    {index === ruleAt && index > 0 ? (
                      /* The line the last check drew. Everything above it has
                         moved since; everything below it was covered. */
                      <p className="border-b bg-muted/40 px-3 py-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t(locale, "checked to here")} —{" "}
                        {formatDate(lastCheck!.asOf, locale)}
                      </p>
                    ) : null}
                    <Link
                      href={`/app/finance/transactions/${entry.id}`}
                      className="flex items-start justify-between gap-3 px-3 py-2 transition-colors hover:bg-accent/40"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {detail}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                          <span>{formatDateTime(entry.occurredAt, locale)}</span>
                          <span className="font-mono">{sourceRef}</span>
                          {tracking ? (
                            <span className="font-mono">{tracking}</span>
                          ) : null}
                          {entry.recordedBy ? (
                            <span>{entry.recordedBy.name}</span>
                          ) : null}
                        </span>
                      </span>
                      <span
                        className={`tabular shrink-0 font-mono text-sm font-semibold ${
                          inbound ? "text-success" : "text-destructive"
                        }`}
                      >
                        {inbound ? "+" : "−"}
                        {money(toNumber(entry.amount))}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="space-y-4">
          {/* The reconcile control: only for the chairs that answer for the
              figures, and only on an account money can still move through. */}
          {canReconcile && account.active ? (
            <ReconcileForm
              accountId={account.id}
              kind={account.kind}
              systemBalance={net}
              currency={account.currency}
            />
          ) : null}
          {canReconcile && !account.active ? (
            <p className="rounded-xl border border-dashed bg-muted/20 p-3 text-[11px] text-muted-foreground">
              {t(
                locale,
                "Archived — a historical record, not somewhere money goes, so there is nothing left to check."
              )}
            </p>
          ) : null}

          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t(locale, "Every check on this account")}
            </h2>
            {history.length === 0 ? (
              /* The absence stated as the finding it is — not an empty box. */
              <p className="rounded-xl border border-dashed border-warning/40 bg-warning/5 p-3 text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-medium text-warning">
                  {t(locale, "Never checked.")}
                </span>{" "}
                {t(
                  locale,
                  "Every figure on this page is the system agreeing with itself. Until somebody types in what the bank, the phone or the till actually says, there is nothing here a mistake could show up against."
                )}
              </p>
            ) : (
              <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                {history.map((row) => {
                  const difference = toNumber(row.difference);
                  const verdict =
                    STATE_TEXT[row.state] ?? STATE_TEXT.PENDING;
                  return (
                    <li key={row.id} className="px-3 py-2">
                      <p className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="font-medium">
                          {formatDate(row.asOf, locale)}
                        </span>
                        <span
                          className={`tabular text-xs font-semibold ${verdict.tone}`}
                        >
                          {difference === 0
                            ? t(locale, verdict.label)
                            : `${
                                difference < 0
                                  ? t(locale, "short by")
                                  : t(locale, "over by")
                              } ${formatMoney(
                                Math.abs(difference),
                                row.currency
                              )}`}
                        </span>
                      </p>
                      <p className="tabular mt-0.5 text-[11px] text-muted-foreground">
                        {t(locale, "system")}{" "}
                        {formatMoney(toNumber(row.systemBalance), row.currency)} ·{" "}
                        {t(locale, "actual")}{" "}
                        {formatMoney(toNumber(row.actualBalance), row.currency)} ·{" "}
                        {row.checkedBy.name} ·{" "}
                        {formatRelative(row.createdAt, locale)}
                      </p>
                      {row.note ? (
                        <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                          {row.note}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
