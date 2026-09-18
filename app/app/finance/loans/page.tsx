import type { Metadata } from "next";
import Link from "next/link";
import { Landmark } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { FinanceWorkspaceHeader } from "@/components/app/finance-workspace-header";
import { LoanMovementForm } from "@/components/app/loan-movement-form";
import { activeAccounts, loanAccounts } from "@/lib/accounts";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses";
import { formatDate, formatMoney } from "@/lib/format";
import { t } from "@/lib/i18n";
import { loanRegister, loanTotals } from "@/lib/loans";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Loans" };

/**
 * MONEY THE COMPANY HAS BORROWED, AND WHAT IT STILL OWES.
 *
 * A lender's money is neither the company's cash nor its income, so it lives
 * here and nowhere else: the accounts page, the cash figures and every income
 * and profit total leave loan accounts out. What is owed is summed from the
 * ledger lines on the loan account each time the page is read.
 *
 * The manager reads this page (he is the lender, and should see what the
 * company says it owes him) but does not record on it.
 */
export default async function FinanceLoansPage() {
  const user = await requirePermission("loan.view");
  const locale = await viewerLocale();
  const mayRecord = can(user.role, "loan.record");

  const [loans, companyAccounts] = await Promise.all([
    loanAccounts(),
    mayRecord ? activeAccounts() : Promise.resolve([]),
  ]);
  const views = await Promise.all(
    loans.map(async (loan) => {
      const [totals, register] = await Promise.all([loanTotals(loan.id), loanRegister(loan.id)]);
      return { loan, totals, register };
    })
  );

  return (
    <>
      <FinanceWorkspaceHeader role={user.role} />

      <p className="mb-4 -mt-2 max-w-3xl text-sm text-muted-foreground">
        {t(locale, "Money a lender put into the business, and what has been paid back. It is borrowed, not earned: none of it counts as income, and repaying it is not a cost.")}
      </p>

      {views.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title={t(locale, "No loans yet")}
          description={t(locale, "When a loan account exists, costs paid from it and repayments to the lender are tracked here.")}
        />
      ) : null}

      <div className="space-y-6">
        {views.map(({ loan, totals, register }) => {
          const lender = loan.accountName || loan.name;
          const byId = new Map(register.map((line) => [line.id, line]));
          const accounts = companyAccounts
            .filter((a) => a.currency === loan.currency)
            .map((a) => ({ id: a.id, name: a.name }));
          const money = (n: number) => formatMoney(n, loan.currency);

          return (
            <section key={loan.id} className="rounded-xl border bg-card shadow-soft">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
                <div className="flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-muted-foreground" />
                  <h2 className="text-base font-semibold">{loan.name}</h2>
                  {loan.active ? null : (
                    <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                      {t(locale, "Closed to new borrowing")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t(locale, "Lender")}: <span className="font-medium text-foreground">{lender}</span> · {loan.currency}
                </p>
              </header>

              <div className="grid grid-cols-2 gap-px overflow-hidden border-b bg-border lg:grid-cols-4">
                <Figure
                  label={t(locale, "Total borrowed")}
                  value={money(totals.borrowed)}
                  hint={
                    totals.cashReceived > 0
                      ? `${t(locale, "incl.")} ${money(totals.cashReceived)} ${t(locale, "handed over in cash")}`
                      : null
                  }
                />
                <Figure label={t(locale, "Costs paid with the loan")} value={money(totals.expensesPaid)} />
                <Figure label={t(locale, "Repaid")} value={money(totals.repaid)} />
                <Figure
                  label={t(locale, "Still owed")}
                  value={money(Math.max(totals.owed, 0))}
                  tone={totals.owed > 0.005 ? "owed" : "clear"}
                  hint={
                    totals.owed < -0.005
                      ? `${lender} ${t(locale, "was repaid more than was borrowed")}: ${money(-totals.owed)}`
                      : totals.owed > 0.005
                        ? `${t(locale, "The company owes")} ${lender}`
                        : t(locale, "Nothing is owed")
                  }
                />
              </div>

              {mayRecord ? (
                <div className="border-b px-5 py-4">
                  {accounts.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      {t(locale, "No company account is in")} {loan.currency}
                      {t(locale, ", so nothing can be repaid or received on this loan yet.")}
                    </p>
                  ) : (
                    <LoanMovementForm
                      loanAccountId={loan.id}
                      lender={lender}
                      currency={loan.currency}
                      owed={Math.max(totals.owed, 0)}
                      accounts={accounts}
                    />
                  )}
                </div>
              ) : null}

              <div className="px-5 py-4">
                <h3 className="mb-3 text-sm font-semibold">{t(locale, "Every movement on this loan")}</h3>
                {register.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t(locale, "Nothing yet. When the lender pays a company cost with his own money, record the cost as usual and choose this loan under “Paid from”.")}
                  </p>
                ) : (
                  <ol className="divide-y">
                    {[...register].reverse().map((line) => {
                      const borrowedLine = line.direction === "OUT";
                      /* A cancelling line carries no link of its own to the cost
                         or movement it undoes — only to the line it reverses —
                         so it is described through that line. */
                      const original = line.reversesId ? byId.get(line.reversesId) : undefined;
                      const cancels = original?.entryNumber ?? null;
                      const source = original ?? line;
                      let what: React.ReactNode;
                      if (source.expense) {
                        const e = source.expense;
                        what = (
                          <>
                            <span className="font-medium">
                              {cancels
                                ? e.status === "VOID"
                                  ? t(locale, "Cost cancelled")
                                  : t(locale, "Cost corrected")
                                : `${t(locale, "Cost paid by")} ${lender}`}
                            </span>
                            <span className="text-muted-foreground">
                              {" — "}
                              {e.description || t(locale, EXPENSE_CATEGORY_LABELS[e.category] ?? e.category)}
                              {" · "}
                              <span className="font-mono">{e.expenseNumber}</span>
                              {e.batch ? (
                                <>
                                  {" · "}
                                  <Link href={`/app/batches/${e.batch.id}`} className="underline-offset-2 hover:underline">
                                    {e.batch.batchNumber}
                                  </Link>
                                </>
                              ) : null}
                            </span>
                          </>
                        );
                      } else if (source.loanMovement) {
                        const m = source.loanMovement;
                        what = (
                          <>
                            <span className="font-medium">
                              {cancels
                                ? m.kind === "REPAID"
                                  ? t(locale, "Repayment cancelled")
                                  : t(locale, "Money received cancelled")
                                : m.kind === "REPAID"
                                  ? `${t(locale, "Repaid")} ${lender}`
                                  : `${lender} ${t(locale, "handed over cash")}`}
                            </span>
                            <span className="text-muted-foreground">
                              {" — "}
                              {m.kind === "REPAID" ? t(locale, "from") : t(locale, "into")} {m.account.name}
                              {" · "}
                              <span className="font-mono">{m.movementNumber}</span>
                              {m.reference ? ` · ${m.reference}` : ""}
                            </span>
                            {m.note ? <span className="block text-xs text-muted-foreground">{m.note}</span> : null}
                          </>
                        );
                      } else {
                        what = <span className="text-muted-foreground">{line.description}</span>;
                      }

                      return (
                        <li key={line.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                          <div className={cn("min-w-0 text-sm", !line.live && "opacity-60")}>
                            <div>{what}</div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              {formatDate(line.occurredAt, locale)}
                              {line.recordedBy ? ` · ${t(locale, "recorded by")} ${line.recordedBy.name}` : ""}
                              {" · "}
                              <Link
                                href={`/app/finance/transactions/${line.id}`}
                                className="font-mono underline-offset-2 hover:underline"
                              >
                                {line.entryNumber}
                              </Link>
                              {line.reversedBy ? (
                                <span className="ml-1 text-destructive">
                                  · {t(locale, "cancelled by")} {line.reversedBy.entryNumber}
                                </span>
                              ) : null}
                              {cancels ? (
                                <span className="ml-1">
                                  · {t(locale, "cancels")} {cancels}
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <div className="shrink-0 text-left sm:text-right">
                            <div
                              className={cn(
                                "font-mono text-sm font-semibold tabular-nums",
                                !line.live
                                  ? "text-muted-foreground line-through"
                                  : borrowedLine
                                    ? "text-warning"
                                    : "text-success"
                              )}
                            >
                              {borrowedLine ? "+" : "−"}
                              {money(line.amount)}
                            </div>
                            {line.settled ? (
                              <div className="text-xs text-muted-foreground tabular-nums">
                                {t(locale, "owed after")}: {money(line.owedAfter)}
                              </div>
                            ) : null}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}

function Figure({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string | null;
  tone?: "owed" | "clear";
}) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 font-mono text-lg font-semibold tabular-nums",
          tone === "owed" && "text-warning",
          tone === "clear" && "text-success"
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
