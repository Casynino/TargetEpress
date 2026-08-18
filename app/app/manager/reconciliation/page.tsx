import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Info,
  PlaneLanding,
  TriangleAlert,
} from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { formatDate, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { formatShillings } from "@/lib/money";
import { can } from "@/lib/rbac";
import { reconciliation } from "@/lib/reconciliation";
import { requirePermission } from "@/lib/session";
import { statementSummary, submittedStatements } from "@/lib/statements";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Reconciliation" };

/**
 * The books against the accounts.
 *
 * Read top to bottom: each row is one question asked twice by different routes,
 * with both answers side by side. The clean rows earn their place — a page that
 * showed only faults could not distinguish "we checked and it agrees" from "we
 * did not check", and those are the two states a manager most needs told apart
 * before signing anything off.
 *
 * The flights waiting on a sign-off sit above them for that last clause. A
 * statement is the one thing on this desk that BLOCKS somebody else — Finance
 * cannot finish a flight until it is ruled on — and until now it appeared on no
 * screen the manager opens, so it could sit for a fortnight without anybody
 * being told. It is a short queue by nature, so it costs the checks below
 * almost nothing and it is the first thing read.
 */
export default async function ManagerReconciliation() {
  const user = await requirePermission("report.view");
  const locale = await viewerLocale();
  const [{ checks, negative }, waiting, rateRow] = await Promise.all([
    reconciliation(),
    submittedStatements(),
    currentRate(),
  ]);
  const summary = await statementSummary(waiting);
  /* Fallback only. Each statement carries the rate it was closed at, and that
     is what its own row converts with; today's rate is for the total across
     several of them, and for a statement closed before any rate was published. */
  const rate = rateRow ? toNumber(rateRow.rate) : null;

  const faults = checks.filter((c) => !c.ok).length;
  /*
    Finance reaches this page too — report.view, not statement.review — and for
    that desk the same list is not a queue, it is the wait. Only the ruling is
    withheld; seeing what it submitted and how long ago is exactly what stops it
    asking. Same idiom as the approvals board: everybody reads, one desk acts.
  */
  const mine = can(user.role, "statement.review");

  return (
    <>
      <PageHeader
        title={t(locale, "Reconciliation")}
        description={t(
          locale,
          "Each figure asked twice, by two different routes. Where the two answers differ, the difference is here."
        )}
      />

      <p
        className={
          faults > 0
            ? "mb-4 rounded-lg border border-destructive/40 bg-destructive/[0.05] px-3 py-2 text-sm font-medium text-destructive"
            : "mb-4 rounded-lg border border-success/40 bg-success/[0.05] px-3 py-2 text-sm font-medium text-success"
        }
      >
        {faults > 0
          ? `${faults} ${t(locale, faults === 1 ? "check disagrees" : "checks disagree")}`
          : t(locale, "Everything agrees. The books and the accounts tell the same story.")}
      </p>

      {/*
        Finance shuts a flight's books; somebody senior agrees them. This is the
        gap between those two facts, and nothing more — no accept, no send-back.
        The ruling stays on the closed-batches sheet, which holds the whole
        statement, the guard on it and the audit row it writes; a second control
        here would be a second path to the same decision, and one of the two
        always ends up missing a check the other has.
      */}
      <section className="mb-5">
        <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <h2 className="text-sm font-semibold">
            {mine
              ? t(locale, "Flights waiting on you")
              : t(locale, "Flights waiting on a sign-off")}
          </h2>
          {summary.waiting > 0 ? (
            <>
              <span className="tabular text-sm text-muted-foreground">
                {summary.waiting}
              </span>
              {/* Age is the alarm, not the count: one flight nobody has read for
                  a week is worse than four closed this morning. Warning rather
                  than the destructive red the checks below wear — an unread
                  statement is late, not wrong, and the two must not look alike
                  on a page whose other rows mean something has gone astray. */}
              <span
                className={
                  (summary.oldestDays ?? 0) >= 3
                    ? "text-[11px] font-semibold text-warning"
                    : "text-[11px] text-muted-foreground"
                }
              >
                {summary.oldestDays === 0
                  ? t(locale, "oldest today")
                  : `${t(locale, "oldest")} ${summary.oldestDays}${t(locale, "d")}`}
              </span>
              {/*
                Said to be at today's rate, because it is the one figure here
                that is not frozen. Each row converts at the rate its own
                statement was closed at, so a total struck across several of
                them will not add up to the rows underneath — the closed-batches
                sheet answers this by printing no shilling total at all. A
                manager still wants to know how much is sitting unread, so the
                total stays and says which rate produced it.
              */}
              <span className="ml-auto flex items-baseline gap-1.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {t(locale, "at today's rate")}
                </span>
                <span className="tabular text-sm font-semibold">
                  {formatShillings(summary.revenueUsd, rate)}
                </span>
                <span className="tabular text-[11px] text-muted-foreground">
                  {t(locale, "profit")} {formatShillings(summary.profitUsd, rate)}
                </span>
              </span>
            </>
          ) : null}
        </div>

        {waiting.length === 0 ? (
          /* One line, not an empty state. The checks below are the page. */
          <p className="text-[11px] text-muted-foreground">
            {t(
              locale,
              "Nothing closed is waiting. Every flight Finance has shut has been read and agreed."
            )}
          </p>
        ) : (
          <ul className="space-y-2">
            {waiting.map((row) => {
              const stale = row.waitingDays >= 3;
              /* Shillings at the rate the statement was frozen at, so this row
                 shows the figure that will still be on it when it is signed —
                 today's rate is only for the flights closed before any was
                 published. */
              const at = row.rate ?? rate;
              return (
                <li
                  key={row.batchId}
                  className={
                    stale
                      ? "rounded-xl border border-warning/40 bg-warning/[0.03] p-3"
                      : "rounded-xl border bg-card p-3"
                  }
                >
                  <div className="flex items-start gap-2.5">
                    <PlaneLanding
                      className={
                        stale
                          ? "mt-0.5 h-4 w-4 shrink-0 text-warning"
                          : "mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2">
                        {/* The flight itself: its cargo, its costs, its close
                            note. The evidence, not the decision. */}
                        <Link
                          href={`/app/shipments/${row.batchId}`}
                          className="focus-ring rounded text-sm font-semibold underline-offset-2 hover:underline"
                        >
                          {row.batchNumber}
                        </Link>
                        {row.flight ? (
                          <span className="text-[11px] text-muted-foreground">
                            {row.flight}
                          </span>
                        ) : null}
                        <span
                          className={
                            stale
                              ? "text-[11px] font-semibold text-warning"
                              : "text-[11px] text-muted-foreground"
                          }
                        >
                          {row.waitingDays === 0
                            ? t(locale, "closed today")
                            : `${t(locale, "waiting")} ${row.waitingDays}${t(locale, "d")}`}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {t(locale, "Closed by")}{" "}
                        {row.submittedBy ??
                          row.closedBy ??
                          t(locale, "the system, on its last payment")}
                        {" · "}
                        {formatDate(row.closedAt ?? row.submittedAt, locale)}
                      </p>

                      <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
                        <span>
                          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t(locale, "Worth")}
                          </span>
                          <span className="tabular text-sm font-semibold">
                            {formatShillings(row.revenueUsd, at)}
                          </span>
                        </span>
                        <span>
                          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t(locale, "Costs")}
                          </span>
                          <span className="tabular text-sm font-semibold">
                            {formatShillings(row.expensesUsd, at)}
                          </span>
                        </span>
                        <span>
                          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t(locale, "Profit")}
                          </span>
                          {/* A flight that lost money is the one worth opening,
                              so it is the one figure that changes colour. */}
                          <span
                            className={
                              row.profitUsd !== null && row.profitUsd < 0
                                ? "tabular text-sm font-semibold text-destructive"
                                : "tabular text-sm font-semibold"
                            }
                          >
                            {row.profitUsd === null
                              ? "—"
                              : formatShillings(row.profitUsd, at)}
                          </span>
                        </span>
                        <span>
                          <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                            {t(locale, "Kg")}
                          </span>
                          <span className="tabular text-sm font-semibold">
                            {row.kg.toFixed(1)}
                          </span>
                        </span>

                        {/*
                          Straight onto the row that carries the accept and the
                          send-back, filtered to this one flight. Withheld from a
                          reader who cannot rule — the batch link above still
                          opens the flight, because reading it is not the ruling.
                        */}
                        {mine ? (
                          <Link
                            href={`/app/finance/income?status=SUBMITTED&q=${encodeURIComponent(row.batchNumber)}`}
                            className="focus-ring ml-auto inline-flex items-center gap-1 rounded text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                          >
                            {t(locale, "Read the statement")}
                            <ArrowRight className="h-3 w-3" />
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <div className="space-y-2">
        {checks.map((c) => {
          /* Failing beats explained. A check can be both — two payments really
             are off the register AND the reason is known — and dressing that
             row in the calm blue of a footnote because it happens to carry an
             explanation is how a fault gets read as a remark. The note still
             renders below; only the row's face follows the verdict. */
          const Icon = !c.ok ? TriangleAlert : c.expected ? Info : CheckCircle2;
          const tone = !c.ok
            ? "text-destructive"
            : c.expected
              ? "text-info"
              : "text-success";
          return (
            <div
              key={c.key}
              className={
                c.ok
                  ? "rounded-xl border bg-card p-3"
                  : "rounded-xl border border-destructive/40 bg-destructive/[0.03] p-3"
              }
            >
              <div className="flex items-start gap-2.5">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t(locale, c.label)}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {t(locale, c.question)}
                  </p>

                  {/* Both answers, adjacent, so the gap is read rather than
                      calculated. Tabular figures because the eye compares
                      columns of digits, not sentences. */}
                  <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-2">
                    <span>
                      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t(locale, c.left.label)}
                      </span>
                      <span className="tabular text-sm font-semibold">
                        {c.left.value}
                      </span>
                    </span>
                    <span>
                      <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                        {t(locale, c.right.label)}
                      </span>
                      <span
                        className={
                          c.ok
                            ? "tabular text-sm font-semibold"
                            : "tabular text-sm font-semibold text-destructive"
                        }
                      >
                        {c.right.value}
                      </span>
                    </span>
                    {c.href ? (
                      <Link
                        href={c.href}
                        className="focus-ring ml-auto inline-flex items-center gap-1 rounded text-[11px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                      >
                        {t(locale, "Open")}
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                    ) : null}
                  </div>

                  {c.expected ? (
                    <p className="mt-2 border-l-2 border-info/40 pl-2 text-[11px] text-muted-foreground">
                      {t(locale, c.expected)}
                    </p>
                  ) : null}

                  {/* The specific accounts, not just the count. A manager told
                      "one account is negative" then has to go and find it. */}
                  {c.key === "negative" && negative.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {negative.map((a) => (
                        <li
                          key={a.id}
                          className="flex items-center justify-between gap-3 text-[11px]"
                        >
                          <span className="truncate font-medium">{a.name}</span>
                          <span className="tabular shrink-0 text-destructive">
                            {a.balance.toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}{" "}
                            {a.currency}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
