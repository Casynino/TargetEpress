import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Clock, Paperclip, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { MoneyTile } from "@/components/app/money-tile";
import { PageHeader } from "@/components/app/page-header";
import { FinanceNav } from "@/components/app/finance-nav";
import { ExpenseForm } from "@/components/app/expense-form";
import { ExpenseRowActions } from "@/components/app/expense-row-actions";
import { Badge } from "@/components/ui/badge";
import { activeAccounts } from "@/lib/accounts";
import {
  COMMON_EXPENSES,
  EXPENSE_APPROVAL_THRESHOLD_USD,
  EXPENSE_CATEGORY_LABELS as CATEGORY_LABELS,
  EXPENSE_STATUS_LABELS as STATUS_LABEL,
} from "@/lib/expenses";
import { financeTabs } from "@/lib/finance-tabs";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Expenses" };

const STATUS_TONE: Record<string, string> = {
  PENDING: "border-warning/40 text-warning",
  APPROVED: "border-brand/40 text-brand",
  PAID: "border-success/40 text-success",
  VOID: "text-muted-foreground line-through",
};

/**
 * Money going out.
 *
 * The half of the business the system could not see until now. Revenue without
 * costs is not a financial picture, it is a sales report — and every profit
 * figure the owner has asked for starts here.
 *
 * Two dates are tracked and they are genuinely different: when the cost was
 * INCURRED, which is what a profit figure for a month uses, and when the money
 * LEFT, which is what the ledger and a bank statement agree on. Only the second
 * writes a ledger line, because only the second is a movement of money.
 */
const PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
] as const;

/** Start of the chosen window. Null means all time. */
function windowStart(period: string): Date | null {
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === "week") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Monday, because a Tanzanian working week is not read Sunday-first.
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d;
  }
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  if (period === "all") return null;
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requirePermission("expense.view");
  const locale = await viewerLocale();
  const canRecord = can(user.role, "expense.record");
  const canApprove = can(user.role, "expense.approve");

  const { period: rawPeriod } = await searchParams;
  const period = PERIODS.some((p) => p.key === rawPeriod)
    ? (rawPeriod as string)
    : "month";
  const periodLabel =
    PERIODS.find((p) => p.key === period)?.label ?? "This month";
  const from = windowStart(period);
  const inWindow = from ? { gte: from } : undefined;

  const [
    expenses,
    accounts,
    dispatches,
    paidThisMonth,
    outstanding,
    byCategory,
    rateRow,
    usedMost,
  ] = await Promise.all([
      prisma.expense.findMany({
        where: inWindow ? { incurredAt: inWindow } : {},
        orderBy: [{ incurredAt: "desc" }, { createdAt: "desc" }],
        take: 100,
        include: {
          account: { select: { name: true } },
          recordedBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
          batch: { select: { batchNumber: true, id: true } },
          receipts: { select: { id: true, url: true, filename: true } },
        },
      }),
      activeAccounts(),
      // Only dispatches still worth attaching a cost to. A flight that closed
      // last year is not what somebody is filing today's customs bill against.
      prisma.batch.findMany({
        where: { status: { in: ["OPEN", "READY_TO_DEPART", "IN_TRANSIT", "ARRIVED", "VERIFIED"] } },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: { id: true, batchNumber: true },
      }),
      prisma.expense.aggregate({
        where: { status: "PAID", ...(inWindow ? { paidAt: inWindow } : {}) },
        _sum: { amountUsd: true },
        _count: true,
      }),
      prisma.expense.aggregate({
        where: { status: { in: ["PENDING", "APPROVED"] } },
        _sum: { amountUsd: true },
        _count: true,
      }),
      prisma.expense.groupBy({
        by: ["category"],
        where: { status: "PAID", ...(inWindow ? { paidAt: inWindow } : {}) },
        _sum: { amountUsd: true },
        orderBy: { _sum: { amountUsd: "desc" } },
        take: 4,
      }),
      currentRate(),
      // The shortcuts become the business's own: what has actually been
      // recorded most often leads, and the seeded common costs fill in behind
      // so the row is never empty on a quiet week.
      prisma.expense.groupBy({
        by: ["description", "category"],
        where: { status: { not: "VOID" } },
        _count: true,
        orderBy: { _count: { description: "desc" } },
        take: 8,
      }),
    ]);

  const rate = rateRow ? toNumber(rateRow.rate) : null;

  const seen = new Set<string>();
  const quick = [
    ...usedMost.map((row) => ({
      label: row.description,
      category: row.category as string,
    })),
    ...COMMON_EXPENSES,
  ]
    .filter((item) => {
      const key = item.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);

  const awaitingApprovalUsd = expenses
    .filter(
      (e) =>
        e.status === "PENDING" &&
        toNumber(e.amountUsd) > EXPENSE_APPROVAL_THRESHOLD_USD
    )
    .reduce((sum, e) => sum + toNumber(e.amountUsd), 0);
  const awaitingApproval = expenses.filter(
    (e) =>
      e.status === "PENDING" &&
      toNumber(e.amountUsd) > EXPENSE_APPROVAL_THRESHOLD_USD
  ).length;

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    accountNumber: a.accountNumber,
  }));

  return (
    <>
      <PageHeader
        title={t(locale, "Expenses")}
        description={t(
          locale,
          "What the business spends, and what it has already paid. Costs are dated when they were incurred; the money is dated when it left."
        )}
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      {/* Period first: "how much did we spend" is meaningless without saying
             over what. URL state, so a month can be linked to and reloaded. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={
              p.key === "month"
                ? "/app/finance/expenses"
                : `/app/finance/expenses?period=${p.key}`
            }
            aria-current={period === p.key ? "true" : undefined}
            className={`focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              period === p.key
                ? "border-brand bg-brand text-brand-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {t(locale, p.label)}
          </Link>
        ))}
      </div>

      {/* The total, always. A page that shows nothing when nothing has been
             recorded cannot answer "how much have we spent" — which is the
             question it exists for, and zero is a real answer to it. */}
      <div className="mb-6 rounded-2xl border bg-card p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <ArrowUpRight className="h-4 w-4 text-warning" />
              {t(locale, "Spent")} · {t(locale, periodLabel).toLowerCase()}
            </p>
            <p className="mt-2 font-display text-[36px] font-bold leading-none tracking-tight tabular-nums">
              {rate ? (
                <>
                  <span className="text-lg font-semibold text-muted-foreground">
                    TSh{" "}
                  </span>
                  {Math.round(
                    toNumber(paidThisMonth._sum.amountUsd) * rate
                  ).toLocaleString("en-US")}
                </>
              ) : (
                formatUsd(toNumber(paidThisMonth._sum.amountUsd))
              )}
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">
              {formatUsd(toNumber(paidThisMonth._sum.amountUsd))}{" "}
              {t(locale, "on the invoice rate")} · {paidThisMonth._count}{" "}
              {t(
                locale,
                paidThisMonth._count === 1
                  ? "cost actually paid"
                  : "costs actually paid"
              )}
            </p>
          </div>

          <dl className="flex flex-wrap gap-x-8 gap-y-3">
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                {t(locale, "Not yet paid")}
              </dt>
              <dd className="mt-0.5 font-display text-lg font-bold tabular-nums">
                {rate
                  ? `TSh ${Math.round(toNumber(outstanding._sum.amountUsd) * rate).toLocaleString("en-US")}`
                  : formatUsd(toNumber(outstanding._sum.amountUsd))}
              </dd>
              <p className="text-[11px] text-muted-foreground">
                {outstanding._count} {t(locale, "waiting")}
              </p>
            </div>
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                {t(locale, "Needs the CEO")}
              </dt>
              <dd
                className={`mt-0.5 font-display text-lg font-bold tabular-nums ${
                  awaitingApproval > 0 ? "text-warning" : ""
                }`}
              >
                {awaitingApproval}
              </dd>
              <p className="text-[11px] text-muted-foreground">
                {t(locale, "over the limit")}
              </p>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">
                {t(locale, "Biggest category")}
              </dt>
              <dd className="mt-0.5 font-display text-lg font-bold tabular-nums">
                {byCategory[0]
                  ? rate
                    ? `TSh ${Math.round(toNumber(byCategory[0]._sum.amountUsd) * rate).toLocaleString("en-US")}`
                    : formatUsd(toNumber(byCategory[0]._sum.amountUsd))
                  : "—"}
              </dd>
              <p className="text-[11px] text-muted-foreground">
                {byCategory[0]
                  ? t(locale, CATEGORY_LABELS[byCategory[0].category])
                  : t(locale, "nothing paid yet")}
              </p>
            </div>
          </dl>
        </div>
      </div>

      {canRecord ? (
        <div className="mb-6">
          <ExpenseForm
            categories={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
              value,
              label: t(locale, label),
            }))}
            accounts={accountOptions}
            dispatches={dispatches.map((d) => ({
              id: d.id,
              label: d.batchNumber,
            }))}
            quick={quick}
            thresholdUsd={EXPENSE_APPROVAL_THRESHOLD_USD}
            rate={rate}
          />
        </div>
      ) : null}

      <div>
        <div>
          {expenses.length === 0 ? (
            <EmptyState
              title={
                period === "all"
                  ? t(locale, "No costs recorded yet")
                  : `${t(locale, "Nothing recorded")} ${t(locale, periodLabel).toLowerCase()}`
              }
              description={
                period === "all"
                  ? t(
                      locale,
                      "Every cost recorded here becomes part of the profit figure — and one tied to a dispatch becomes part of that flight's."
                    )
                  : t(locale, "Try a wider period, or record the first one.")
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
              <ul className="divide-y">
                {expenses.map((expense) => {
                  const usd = toNumber(expense.amountUsd);
                  return (
                    <li key={expense.id} className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{expense.description}</p>
                          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                            <span className="font-mono">
                              {expense.expenseNumber}
                            </span>
                            <span>·</span>
                            <span>
                              {t(locale, CATEGORY_LABELS[expense.category])}
                            </span>
                            {expense.vendor ? (
                              <>
                                <span>·</span>
                                <span>{expense.vendor}</span>
                              </>
                            ) : null}
                            <span>·</span>
                            <span>{formatDate(expense.incurredAt, locale)}</span>
                            {expense.batch ? (
                              <>
                                <span>·</span>
                                <Link
                                  href={`/app/batches/${expense.batch.id}`}
                                  className="hover:text-brand"
                                >
                                  {expense.batch.batchNumber}
                                </Link>
                              </>
                            ) : null}
                            {expense.receipts.length > 0 ? (
                              <>
                                <span>·</span>
                                <a
                                  href={expense.receipts[0].url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 hover:text-brand"
                                >
                                  <Paperclip className="h-3 w-3" />
                                  {expense.receipts.length === 1
                                    ? t(locale, "receipt")
                                    : `${expense.receipts.length} ${t(locale, "receipts")}`}
                                </a>
                              </>
                            ) : null}
                          </p>
                        </div>

                        <div className="text-right">
                          <p className="font-mono text-sm font-medium tabular">
                            {formatMoney(expense.amount, expense.currency)}
                          </p>
                          {expense.currency === "USD" ? null : (
                            <p className="text-xs text-muted-foreground">
                              {formatUsd(usd)}
                            </p>
                          )}
                          <Badge
                            variant="outline"
                            className={`mt-1 font-normal ${STATUS_TONE[expense.status]}`}
                          >
                            {t(locale, STATUS_LABEL[expense.status])}
                          </Badge>
                        </div>
                      </div>

                      {expense.status === "PAID" && expense.account ? (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {t(locale, "Paid from")} {expense.account.name}
                          {expense.paidAt
                            ? ` ${t(locale, "on")} ${formatDate(expense.paidAt, locale)}`
                            : ""}
                        </p>
                      ) : null}
                      {expense.status === "VOID" && expense.voidReason ? (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {t(locale, "Cancelled:")} {expense.voidReason}
                        </p>
                      ) : null}
                      {expense.approvedBy ? (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          {t(locale, "Approved by")} {expense.approvedBy.name}
                        </p>
                      ) : null}

                      {canRecord || canApprove ? (
                        <div className="mt-2">
                          <ExpenseRowActions
                            expenseId={expense.id}
                            status={expense.status}
                            currency={expense.currency}
                            accounts={accountOptions}
                            canApprove={canApprove}
                            needsApproval={usd > EXPENSE_APPROVAL_THRESHOLD_USD}
                          />
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

      </div>
    </>
  );
}
