import type { Metadata } from "next";
import type { PayrollStatus } from "@prisma/client";
import { BadgeCheck, Clock } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { PayrollAmount } from "@/components/app/payroll-amount";
import { PayrollDecision, PayrollPay } from "@/components/app/payroll-decision";
import { PayrollRunNow } from "@/components/app/payroll-run-now";
import { PayrollLines } from "@/components/app/payroll-lines";
import { SectionLabel } from "@/components/app/section-label";
import { formatDate, formatMonthYear, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { activeAccounts } from "@/lib/accounts";
import { formatShillings } from "@/lib/money";
import { pendingPayrollApproval, payrollRoster, payrollRun, payrollRuns } from "@/lib/payroll";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Payroll" };

/**
 * The manager agrees the month, then pays it.
 *
 * Two presses on purpose. Agreeing is a signature on a list of names and
 * figures; paying is a statement about the day the bank moved. Folded into one
 * they would date every salary run to the moment somebody got round to reading
 * it, and close the only gap in which an agreed run can still be checked
 * against a balance before the money goes.
 *
 * The lines are printed in full, not summarised. Nobody can agree to a total:
 * the question this desk is actually being asked is whether that is the right
 * list of people at the right amounts, and that question needs the list. A
 * summary would make the approval a rubber stamp with extra clicks.
 *
 * A run this reader prepared offers no controls. The action refuses it against
 * the stored preparedById, and a screen that offered the button anyway would be
 * teaching the wrong rule and then failing at the last moment.
 */

/** The status words for THIS desk. Finance's screen names them differently. */
const STATUS_LABEL: Record<PayrollStatus, string> = {
  DRAFT: "Still with Finance",
  PENDING_APPROVAL: "Waiting on you",
  APPROVED: "Agreed by you — not yet paid",
  REJECTED: "Sent back to Finance",
  PAID: "Paid",
};

const STATUS_TONE: Record<PayrollStatus, string> = {
  DRAFT: "border-border text-muted-foreground",
  PENDING_APPROVAL: "border-warning/40 text-warning",
  APPROVED: "border-brand/40 text-brand",
  REJECTED: "border-destructive/40 text-destructive",
  PAID: "border-success/40 text-success",
};

export default async function ManagerPayrollPage() {
  const user = await requirePermission("payroll.approve");
  const locale = await viewerLocale();

  const [pending, runs, rateRow, roster, accounts] = await Promise.all([
    pendingPayrollApproval(),
    payrollRuns(12),
    currentRate(),
    payrollRoster(),
    activeAccounts(),
  ]);
  const rate = rateRow ? toNumber(rateRow.rate) : null;

  /*
    Both queues opened in full, lines and all.

    One read per run rather than one query for the lot, and it costs almost
    nothing: a run is one per month by database constraint, so this desk is
    never looking at more than two or three at once. The alternative — a total
    now and the names behind a click — is the summary this page exists not to
    be.
  */
  const waitingIds = pending.map((p) => p.id);
  const approvedIds = runs.filter((r) => r.status === "APPROVED").map((r) => r.id);
  const opened = await Promise.all(
    [...waitingIds, ...approvedIds].map((id) => payrollRun(id))
  );
  const detailed = opened.filter((r): r is NonNullable<typeof r> => r !== null);

  /* How long each has sat there, worked out by the reader in lib/payroll.ts. */
  const waitedDays = new Map(pending.map((p) => [p.id, p.waitingDays]));

  const decided = runs.filter((r) => r.status === "PAID" || r.status === "REJECTED");

  return (
    <>
      <PageHeader
        title="Payroll"
        description="What Finance has prepared, name by name. Agree it, send it back with a reason, or pay what you have already agreed."
      />

      {/* The owner's one-press month. The two-step queue keeps working below;
          this is the deliberate shortcut for the chair that signs it anyway. */}
      <div className="mb-5">
        <PayrollRunNow
          accounts={accounts.map((account) => ({ id: account.id, name: account.name }))}
          headcount={roster.length}
          totalLabel={formatShillings(
            roster.reduce((sum, person) => sum + person.baseSalary, 0),
            rate
          )}
          defaultYear={new Date().getFullYear()}
          defaultMonth={new Date().getMonth() + 1}
          monthTaken={runs.some(
            (run) =>
              run.year === new Date().getFullYear() &&
              run.month === new Date().getMonth() + 1
          )}
        />
      </div>

      {detailed.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title={t(locale, "Nothing is waiting on you")}
          description={t(
            locale,
            "Finance has not sent up a salary run, and nothing you have agreed is still unpaid."
          )}
        />
      ) : (
        <div className="space-y-6">
          {detailed.map((run) => {
            const waiting = run.status === "PENDING_APPROVAL";
            /* Nobody agrees their own run — the split IS the control, so the
               button is not offered to the desk that wrote the figures. */
            const mine = run.preparedById === user.id;
            const days = waitedDays.get(run.id) ?? 0;

            const lines = run.items.map((item) => ({
              id: item.id,
              name: item.name,
              roleLabel: item.roleLabel,
              employeeId: item.employeeId,
              gross: toNumber(item.gross),
              allowance: toNumber(item.allowance),
              deduction: toNumber(item.deduction),
              net: toNumber(item.net),
              note: item.note,
            }));

            return (
              <section key={run.id} className="space-y-2">
                <SectionLabel>
                  {formatMonthYear(new Date(run.year, run.month - 1, 1), locale)} ·{" "}
                  {t(locale, STATUS_LABEL[run.status])}
                </SectionLabel>

                {/* Everything the decision rests on, in one strip: whose figures
                    they are, how long they have waited, how many people, how
                    much, and out of which account. */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border bg-card px-3 py-2">
                  <span className="font-mono text-xs font-semibold">{run.code}</span>

                  <span className="text-[11px] text-muted-foreground">
                    {t(locale, "prepared by")}{" "}
                    <span className="font-medium text-foreground">
                      {run.preparedBy.name}
                    </span>
                    {" · "}
                    {formatDate(run.submittedAt ?? run.preparedAt, locale)}
                  </span>

                  {waiting ? (
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 text-[11px] font-semibold",
                        days >= 3 ? "text-destructive" : "text-warning"
                      )}
                    >
                      <Clock className="h-3.5 w-3.5" />
                      {days === 0
                        ? t(locale, "sent up today")
                        : `${t(locale, "waiting")} ${days} ${t(
                            locale,
                            days === 1 ? "day" : "days"
                          )}`}
                    </span>
                  ) : null}

                  <span className="text-[11px] text-muted-foreground">
                    {run.totals.headcount} {t(locale, "staff")}
                  </span>

                  <span className="text-[11px] text-muted-foreground">
                    {t(locale, "out of")}{" "}
                    <span className="font-medium text-foreground">
                      {run.account?.name ?? t(locale, "no account named")}
                    </span>
                  </span>

                  <PayrollAmount
                    usd={run.totals.net}
                    rate={rate}
                    strong
                    className="ml-auto text-right"
                  />
                </div>

                {run.note ? (
                  <p className="text-[11px] text-muted-foreground">
                    {t(locale, "Finance says:")} “{run.note}”
                  </p>
                ) : null}

                <PayrollLines
                  lines={lines}
                  totals={run.totals}
                  rate={rate}
                  editable={false}
                />

                {mine ? (
                  <p className="rounded-lg border border-warning/40 bg-warning/[0.04] px-3 py-2 text-[11px] text-muted-foreground">
                    {t(
                      locale,
                      "You prepared this run, so you cannot be the one who agrees it. Somebody else holding payroll approval has to read it."
                    )}
                  </p>
                ) : waiting ? (
                  <PayrollDecision runId={run.id} code={run.code} />
                ) : (
                  <PayrollPay
                    runId={run.id}
                    code={run.code}
                    accountName={run.account?.name ?? t(locale, "the named account")}
                    accountCurrency={run.account?.currency ?? "USD"}
                    netUsd={run.totals.net}
                    headcount={run.totals.headcount}
                    rate={rate}
                  />
                )}
              </section>
            );
          })}
        </div>
      )}

      {/*
        What has already been ruled on.

        Short and read-only. It is here so this desk can see that last month
        went through without opening Finance's screen — and so a run sent back
        does not vanish from the manager's view the moment he sends it.
      */}
      {decided.length > 0 ? (
        <section className="mt-6">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t(locale, "Already ruled on")}
          </h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {decided.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5"
              >
                <span className="min-w-[7rem] text-xs font-medium">
                  {formatMonthYear(new Date(r.year, r.month - 1, 1), locale)}
                </span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  {r.code}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border px-1.5 py-px text-[11px] font-medium",
                    STATUS_TONE[r.status]
                  )}
                >
                  {t(locale, STATUS_LABEL[r.status])}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                  {r.totals.headcount} {t(locale, "staff")}
                  {r.account ? ` · ${r.account.name}` : ""}
                  {r.status === "PAID" && r.paidAt
                    ? ` · ${formatDate(r.paidAt, locale)}`
                    : ""}
                </span>
                {/* A PAID month prints what the bank moved, off its expense —
                    today's rate only prices the runs still ahead of payment.
                    A REJECTED run never paid anything, so it reads like the
                    live ones. */}
                <PayrollAmount
                  usd={r.totals.net}
                  rate={rate}
                  paid={
                    r.status === "PAID" && r.expense
                      ? {
                          amount: toNumber(r.expense.amount),
                          currency: r.expense.currency,
                        }
                      : null
                  }
                  strong
                  className="text-right"
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
