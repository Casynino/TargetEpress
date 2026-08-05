import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, Clock, Paperclip, ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { FinanceNav } from "@/components/app/finance-nav";
import { ExpenseForm } from "@/components/app/expense-form";
import { ExpenseRowActions } from "@/components/app/expense-row-actions";
import { Badge } from "@/components/ui/badge";
import { activeAccounts } from "@/lib/accounts";
import {
  EXPENSE_APPROVAL_THRESHOLD_USD,
  EXPENSE_CATEGORY_LABELS as CATEGORY_LABELS,
  EXPENSE_STATUS_LABELS as STATUS_LABEL,
} from "@/lib/expenses";
import { financeTabs } from "@/lib/finance-tabs";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

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
export default async function ExpensesPage() {
  const user = await requirePermission("expense.view");
  const canRecord = can(user.role, "expense.record");
  const canApprove = can(user.role, "expense.approve");

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [expenses, accounts, dispatches, paidThisMonth, outstanding, byCategory] =
    await Promise.all([
      prisma.expense.findMany({
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
        where: { status: "PAID", paidAt: { gte: monthStart } },
        _sum: { amountUsd: true },
      }),
      prisma.expense.aggregate({
        where: { status: { in: ["PENDING", "APPROVED"] } },
        _sum: { amountUsd: true },
        _count: true,
      }),
      prisma.expense.groupBy({
        by: ["category"],
        where: { status: "PAID" },
        _sum: { amountUsd: true },
        orderBy: { _sum: { amountUsd: "desc" } },
        take: 4,
      }),
    ]);

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
        title="Expenses"
        description="What the business spends, and what it has already paid. Costs are dated when they were incurred; the money is dated when it left."
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      <dl className="mb-6 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-card p-4">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowUpRight className="h-3.5 w-3.5 text-destructive" />
            Paid this month
          </dt>
          <dd className="mt-1 font-display text-lg font-bold tabular-nums">
            {formatUsd(toNumber(paidThisMonth._sum.amountUsd))}
          </dd>
        </div>
        <div className="bg-card p-4">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5 text-warning" />
            Not yet paid
          </dt>
          <dd className="mt-1 font-display text-lg font-bold tabular-nums">
            {formatUsd(toNumber(outstanding._sum.amountUsd))}
          </dd>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {outstanding._count} cost{outstanding._count === 1 ? "" : "s"} waiting
          </p>
        </div>
        <div className="bg-card p-4">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck
              className={`h-3.5 w-3.5 ${awaitingApproval ? "text-warning" : "text-muted-foreground"}`}
            />
            Needs approval
          </dt>
          <dd className="mt-1 font-display text-lg font-bold tabular-nums">
            {awaitingApproval}
          </dd>
          <p className="mt-0.5 text-xs text-muted-foreground">
            over USD {EXPENSE_APPROVAL_THRESHOLD_USD.toLocaleString()}
          </p>
        </div>
        <div className="bg-card p-4">
          <dt className="text-xs text-muted-foreground">Biggest cost so far</dt>
          <dd className="mt-1 font-display text-lg font-bold tabular-nums">
            {byCategory[0]
              ? formatUsd(toNumber(byCategory[0]._sum.amountUsd))
              : formatUsd(0)}
          </dd>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {byCategory[0]
              ? CATEGORY_LABELS[byCategory[0].category]
              : "Nothing paid yet"}
          </p>
        </div>
      </dl>

      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div>
          {expenses.length === 0 ? (
            <EmptyState
              title="Nothing recorded yet"
              description="Every cost recorded here becomes part of the profit figure — and one tied to a dispatch becomes part of that flight's."
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
                            <span>{CATEGORY_LABELS[expense.category]}</span>
                            {expense.vendor ? (
                              <>
                                <span>·</span>
                                <span>{expense.vendor}</span>
                              </>
                            ) : null}
                            <span>·</span>
                            <span>{formatDate(expense.incurredAt)}</span>
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
                                    ? "receipt"
                                    : `${expense.receipts.length} receipts`}
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
                            {STATUS_LABEL[expense.status]}
                          </Badge>
                        </div>
                      </div>

                      {expense.status === "PAID" && expense.account ? (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          Paid from {expense.account.name}
                          {expense.paidAt ? ` on ${formatDate(expense.paidAt)}` : ""}
                        </p>
                      ) : null}
                      {expense.status === "VOID" && expense.voidReason ? (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          Cancelled: {expense.voidReason}
                        </p>
                      ) : null}
                      {expense.approvedBy ? (
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          Approved by {expense.approvedBy.name}
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

        {canRecord ? (
          <ExpenseForm
            categories={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            accounts={accountOptions}
            dispatches={dispatches.map((d) => ({
              id: d.id,
              label: d.batchNumber,
            }))}
            thresholdUsd={EXPENSE_APPROVAL_THRESHOLD_USD}
          />
        ) : null}
      </div>
    </>
  );
}
