import type { Metadata } from "next";
import Link from "next/link";
import type { PayrollStatus } from "@prisma/client";
import { Clock, Undo2 } from "lucide-react";

import { FinanceWorkspaceHeader } from "@/components/app/finance-workspace-header";
import { PayrollAmount } from "@/components/app/payroll-amount";
import {
  PayrollBuild,
  PayrollLines,
  PayrollSubmit,
} from "@/components/app/payroll-lines";
import { activeAccounts } from "@/lib/accounts";
import { formatDate, formatMonthYear, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { payrollRoster, payrollRun, payrollRuns } from "@/lib/payroll";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Payroll" };

/**
 * Finance prepares the month.
 *
 * The owner's rule, in his words: Finance prepares the salary run, sends it to
 * the manager, the manager approves it, and only THEN is the money deducted as
 * a salary expense. This screen is the first half of that sentence, and it is
 * built so the second half is never a surprise — the account is named here, the
 * total is read here, and the moment it goes up the figures freeze.
 *
 * One run fills the screen rather than a list of months with a chevron on each.
 * Payroll is not a queue: a month is built, corrected over a day or two and
 * sent, and there is only ever one run anybody is working on. The months behind
 * it are a register at the foot of the page, which is all they are read as.
 */

/*
  What each status means TO FINANCE.

  Deliberately not shared with the manager's screen, which names the same five
  states in the words of the desk reading them — "With the manager" here is
  "Waiting on you" there. One shared map would have to speak in neither voice.
*/
const STATUS_LABEL: Record<PayrollStatus, string> = {
  DRAFT: "Being prepared",
  PENDING_APPROVAL: "With the manager",
  APPROVED: "Agreed — waiting to be paid",
  REJECTED: "Sent back to you",
  PAID: "Paid",
};

const STATUS_TONE: Record<PayrollStatus, string> = {
  DRAFT: "border-border text-muted-foreground",
  PENDING_APPROVAL: "border-warning/40 text-warning",
  APPROVED: "border-brand/40 text-brand",
  REJECTED: "border-destructive/40 text-destructive",
  PAID: "border-success/40 text-success",
};

/** The two statuses a run is still Finance's to change. */
const EDITABLE: PayrollStatus[] = ["DRAFT", "REJECTED"];

export default async function FinancePayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const user = await requirePermission("payroll.prepare");
  const locale = await viewerLocale();
  const { run: asked } = await searchParams;

  const [runs, accounts, roster, rateRow] = await Promise.all([
    payrollRuns(),
    activeAccounts(),
    payrollRoster(),
    currentRate(),
  ]);
  const rate = rateRow ? toNumber(rateRow.rate) : null;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const thisMonth = runs.find((r) => r.year === year && r.month === month);

  /*
    Which run the screen opens on.

    A run Finance still has to act on outranks this month's, and the two are not
    always the same one: a July run sent back on the 3rd of August, with August
    already built and gone up, is the only thing on this desk anybody is waiting
    for. Newest-editable first, then this month, so a rejection can never be
    stranded behind a month that is already settled — and the register below can
    still ask for any of them by name.
  */
  const open =
    runs.find((r) => r.id === asked) ??
    runs.find((r) => EDITABLE.includes(r.status)) ??
    thisMonth ??
    null;
  const run = open ? await payrollRun(open.id) : null;

  const editable = run !== null && EDITABLE.includes(run.status);
  /* Prisma Decimals cannot cross into a client component, and should not: the
     table is arithmetic on figures, not on database values. */
  const lines =
    run?.items.map((item) => ({
      id: item.id,
      name: item.name,
      roleLabel: item.roleLabel,
      employeeId: item.employeeId,
      gross: toNumber(item.gross),
      allowance: toNumber(item.allowance),
      deduction: toNumber(item.deduction),
      net: toNumber(item.net),
      note: item.note,
    })) ?? [];

  const history = runs.filter((r) => r.id !== run?.id);

  return (
    <>
      <FinanceWorkspaceHeader role={user.role} />

      {/* What THIS tab is for. The department's name and its
          actions are in the shared header above; this is the one
          sentence that belongs to the list below. */}
      <p className="mb-4 -mt-2 max-w-3xl text-sm text-muted-foreground">
        {t(locale, "Build the month from the staff register, correct the exceptions, and send it to the manager. Nothing leaves the account until he has agreed it.")}
      </p>

      {/* Building leads when this month has no run: it is then the one thing to
          do on the screen, and it should not sit underneath last month's. */}
      {thisMonth ? null : (
        <div className="mb-4">
          <PayrollBuild year={year} month={month} headcount={roster.length} />
        </div>
      )}

      {run ? (
        <section className="mb-6 space-y-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 className="font-display text-lg font-bold">
              {formatMonthYear(new Date(run.year, run.month - 1, 1), locale)}
              <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                {run.code}
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                  STATUS_TONE[run.status]
                )}
              >
                {t(locale, STATUS_LABEL[run.status])}
              </span>
              <span className="text-[11px] text-muted-foreground">
                {t(locale, "prepared by")} {run.preparedBy.name} ·{" "}
                {formatDate(run.preparedAt, locale)}
              </span>
            </div>
          </div>

          {/*
            The manager's reason, above everything else.

            A run coming back is the only message that travels down this
            workflow, and it is the whole point of sending one back. Under the
            table it would be found on the second reading, after Finance had
            already started guessing which line he meant.
          */}
          {run.status === "REJECTED" ? (
            <div className="rounded-xl border border-destructive/40 bg-destructive/[0.05] p-3">
              <p className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-destructive">
                <Undo2 className="h-3.5 w-3.5" />
                {t(locale, "Sent back")}
                {run.approvedBy ? ` · ${run.approvedBy.name}` : ""}
                {run.approvedAt ? ` · ${formatDate(run.approvedAt, locale)}` : ""}
              </p>
              <p className="mt-1 text-sm font-medium">
                {run.decisionNote ?? t(locale, "No reason was given.")}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t(
                  locale,
                  "Correct the lines below and send it up again. Last time's ruling is dropped the moment it goes."
                )}
              </p>
            </div>
          ) : null}

          {/* Out of Finance's hands: what it is waiting on and who has it, said
              plainly, because the next move belongs to somebody else. */}
          {run.status === "PENDING_APPROVAL" ? (
            <p className="flex flex-wrap items-center gap-x-1.5 rounded-xl border border-warning/40 bg-warning/[0.05] p-2.5 text-[11px] text-warning">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              <span className="font-semibold">
                {t(locale, "With the manager since")}{" "}
                {formatDate(run.submittedAt ?? run.preparedAt, locale)}.
              </span>
              <span className="text-muted-foreground">
                {t(
                  locale,
                  "Nothing on it can change while it waits. It comes back only if he sends it back."
                )}
              </span>
            </p>
          ) : null}

          {run.status === "APPROVED" ? (
            <p className="flex flex-wrap items-center gap-x-1.5 rounded-xl border border-brand/40 bg-brand/[0.05] p-2.5 text-[11px] text-brand">
              <span className="font-semibold">
                {t(locale, "Agreed by")} {run.approvedBy?.name ?? "—"}
                {run.approvedAt ? ` · ${formatDate(run.approvedAt, locale)}` : ""}
              </span>
              <span className="text-muted-foreground">
                {t(locale, "The money has not moved. The manager pays it, out of")}{" "}
                {run.account?.name ?? t(locale, "no account named")}.
              </span>
            </p>
          ) : null}

          {run.status === "PAID" ? (
            <p className="flex flex-wrap items-center gap-x-1.5 rounded-xl border border-success/40 bg-success/[0.05] p-2.5 text-[11px] text-success">
              <span className="font-semibold">
                {t(locale, "Paid")}
                {run.paidAt ? ` · ${formatDate(run.paidAt, locale)}` : ""}
                {run.paidBy ? ` · ${run.paidBy.name}` : ""}
              </span>
              <span className="text-muted-foreground">
                {t(locale, "out of")} {run.account?.name ?? "—"}
                {run.expense ? ` · ${run.expense.expenseNumber}` : ""}
              </span>
            </p>
          ) : null}

          {run.note && run.status !== "REJECTED" ? (
            <p className="text-[11px] text-muted-foreground">
              {t(locale, "Sent up with a note:")} “{run.note}”
            </p>
          ) : null}

          <PayrollLines
            lines={lines}
            totals={run.totals}
            rate={rate}
            editable={editable}
          />

          {editable ? (
            <PayrollSubmit
              runId={run.id}
              accounts={accounts.map((a) => ({
                id: a.id,
                name: a.name,
                currency: a.currency,
              }))}
              defaultAccountId={run.accountId}
              netUsd={run.totals.net}
              rate={rate}
            />
          ) : null}
        </section>
      ) : null}

      {/*
        The months behind it, one line each.

        The only figure is the net — what left the account, or what will. A
        register is read to check that a month happened and for how much; every
        other column on it answers a question nobody asks of a month they have
        already paid. Each row opens, because a run sent back in March is still
        Finance's to fix in April.
      */}
      {history.length > 0 ? (
        <section>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {t(locale, "Earlier months")}
          </h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {history.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/app/finance/payroll?run=${r.id}`}
                  className="focus-ring flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5 hover:bg-accent/40"
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
                    {r.approvedBy
                      ? ` · ${t(locale, "agreed by")} ${r.approvedBy.name}`
                      : ""}
                  </span>
                  {/* A PAID month prints what the bank moved, off its expense —
                      today's rate only prices the runs still ahead of payment. */}
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
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Nothing built and nothing behind it: say what the screen is for rather
          than stacking an empty card on an empty list. */}
      {run === null && history.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {t(
            locale,
            "No salary run has been built yet. Build one above and it appears here, name by name, for you to correct before it goes up."
          )}
        </p>
      ) : null}
    </>
  );
}
