import type { Metadata } from "next";
import { Users } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { FinanceNav } from "@/components/app/finance-nav";
import { PageHeader } from "@/components/app/page-header";
import { BuildRunForm, SubmitRunForm } from "@/components/app/payroll-forms";
import { PayrollTable } from "@/components/app/payroll-table";
import { SectionLabel } from "@/components/app/section-label";
import { activeAccounts } from "@/lib/accounts";
import { financeTabs } from "@/lib/finance-tabs";
import { toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { formatShillings } from "@/lib/money";
import { codeFor, payrollRoster, payrollRun, payrollRuns } from "@/lib/payroll";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Payroll" };

const STATE: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: "Being built", tone: "text-muted-foreground" },
  PENDING_APPROVAL: { label: "With the manager", tone: "text-info" },
  APPROVED: { label: "Agreed — waiting to be paid", tone: "text-success" },
  PAID: { label: "Paid", tone: "text-success" },
  REJECTED: { label: "Sent back", tone: "text-destructive" },
};

/**
 * Finance builds the month.
 *
 * This desk writes the figures and cannot pay them. The screen is arranged
 * around that boundary: everything editable is above, and the moment the run
 * leaves for the manager the same table is still here to read but nothing on it
 * can be touched — a run somebody is agreeing must not move under them.
 */
export default async function FinancePayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ run?: string }>;
}) {
  const user = await requirePermission("payroll.prepare");
  const locale = await viewerLocale();
  const { run: runParam } = await searchParams;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;

  const [runs, accounts, rateRow, roster] = await Promise.all([
    payrollRuns(),
    activeAccounts(),
    currentRate(),
    payrollRoster(),
  ]);
  const rate = rateRow ? toNumber(rateRow.rate) : null;

  /* The one on screen: whichever was asked for, else this month, else the most
     recent. Finance opens this page mid-month to check a run they built, and
     landing on an empty "build August" prompt when August already exists reads
     as though the work was lost. */
  const target =
    runs.find((r) => r.id === runParam) ??
    runs.find((r) => r.year === year && r.month === month) ??
    runs[0];
  const current = target ? await payrollRun(target.id) : null;

  const editable =
    current?.status === "DRAFT" || current?.status === "REJECTED";
  const thisMonthExists = runs.some((r) => r.year === year && r.month === month);

  return (
    <>
      <PageHeader
        title={t(locale, "Payroll")}
        description={t(
          locale,
          "Build the month from the staff register, then send it to the manager to agree."
        )}
      />
      <FinanceNav tabs={financeTabs(user.role)} />

      {!thisMonthExists ? (
        <div className="mb-5 rounded-xl border bg-card p-3">
          <p className="text-sm font-semibold">
            {t(locale, "No run for")} {codeFor(year, month)}
          </p>
          <p className="mb-2 mt-0.5 text-[11px] text-muted-foreground">
            {roster.length}{" "}
            {t(
              locale,
              roster.length === 1
                ? "person on the register has a salary set."
                : "people on the register have a salary set."
            )}{" "}
            {t(
              locale,
              "Anybody without one is left off — set it on their staff record to include them."
            )}
          </p>
          {roster.length > 0 ? (
            <BuildRunForm year={year} month={month} />
          ) : (
            <p className="text-[11px] text-warning">
              {t(
                locale,
                "Nobody has a salary on their staff record yet, so there is nothing to build."
              )}
            </p>
          )}
        </div>
      ) : null}

      {current ? (
        <>
          <SectionLabel>
            {current.code} · {t(locale, STATE[current.status]?.label ?? current.status)}
          </SectionLabel>

          {/* The manager's reason, when there is one. This is the whole point of
              sending a run back, so it leads rather than sitting in a footer. */}
          {current.status === "REJECTED" && current.decisionNote ? (
            <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/[0.05] px-3 py-2 text-xs text-destructive">
              <strong>{t(locale, "Sent back")}</strong>
              {current.approvedBy ? ` ${t(locale, "by")} ${current.approvedBy.name}` : ""}
              {" — "}
              {current.decisionNote}
            </p>
          ) : null}

          <div className="mb-3 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs">
            <span>
              <span className="text-muted-foreground">{t(locale, "People")} </span>
              <span className="tabular font-semibold">{current.totals.headcount}</span>
            </span>
            <span>
              <span className="text-muted-foreground">{t(locale, "Total")} </span>
              <span className="tabular font-semibold">
                {formatShillings(current.totals.net, rate)}
              </span>
            </span>
            {current.account ? (
              <span>
                <span className="text-muted-foreground">{t(locale, "From")} </span>
                <span className="font-medium">{current.account.name}</span>
              </span>
            ) : null}
            <span className="text-muted-foreground">
              {t(locale, "Built by")} {current.preparedBy.name}
            </span>
          </div>

          <PayrollTable
            items={current.items}
            locale={locale}
            rate={rate}
            editable={editable}
          />

          {editable ? (
            <div className="mt-3">
              <SubmitRunForm
                runId={current.id}
                accounts={accounts}
                defaultAccountId={current.accountId}
              />
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-muted-foreground">
              {current.status === "PENDING_APPROVAL"
                ? t(locale, "With the manager. Nothing can change while it is being read.")
                : current.status === "APPROVED"
                  ? t(locale, "Agreed. The manager pays it from their own screen.")
                  : current.status === "PAID"
                    ? `${t(locale, "Paid")}${current.expense ? ` · ${current.expense.expenseNumber}` : ""}`
                    : ""}
            </p>
          )}
        </>
      ) : (
        <EmptyState
          icon={Users}
          title={t(locale, "No salary runs yet")}
          description={t(
            locale,
            "Build the first month above once the register has salaries on it."
          )}
        />
      )}

      {runs.length > 1 ? (
        <div className="mt-6">
          <SectionLabel>{t(locale, "Earlier months")}</SectionLabel>
          <div className="divide-y rounded-xl border bg-card">
            {runs
              .filter((r) => r.id !== current?.id)
              .map((r) => (
                <a
                  key={r.id}
                  href={`/app/finance/payroll?run=${r.id}`}
                  className="focus-ring flex items-baseline gap-3 px-3 py-2 text-xs hover:bg-accent/40"
                >
                  <span className="font-medium">{r.code}</span>
                  <span
                    className={`text-[11px] ${STATE[r.status]?.tone ?? "text-muted-foreground"}`}
                  >
                    {t(locale, STATE[r.status]?.label ?? r.status)}
                  </span>
                  <span className="ml-auto tabular font-semibold">
                    {formatShillings(r.totals.net, rate)}
                  </span>
                  <span className="tabular w-10 text-right text-[11px] text-muted-foreground">
                    {r.totals.headcount}
                  </span>
                </a>
              ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
