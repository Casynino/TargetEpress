import type { Metadata } from "next";
import { BadgeCheck } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { DecideRunForm, PayRunForm } from "@/components/app/payroll-forms";
import { PayrollTable } from "@/components/app/payroll-table";
import { SectionLabel } from "@/components/app/section-label";
import { toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { formatShillings } from "@/lib/money";
import { payrollRun, payrollRuns } from "@/lib/payroll";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Payroll" };

/**
 * The manager agrees the month, and pays it.
 *
 * Two presses, deliberately not one. Agreeing is a signature on a list of
 * names and figures; paying is a statement about a day the bank moved. Folding
 * them together would date every salary run to the moment somebody got round
 * to approving it, and would remove the only gap in which an agreed run can
 * still be checked against a balance before the money goes.
 *
 * A run this reader prepared offers no controls at all. The action refuses it
 * against the stored preparedById, and a screen that offered the button anyway
 * would be teaching the wrong rule and failing at the last moment.
 */
export default async function ManagerPayrollPage() {
  const user = await requirePermission("payroll.approve");
  const locale = await viewerLocale();

  const [runs, rateRow] = await Promise.all([payrollRuns(), currentRate()]);
  const rate = rateRow ? toNumber(rateRow.rate) : null;

  /* Everything this desk still has to do something about, oldest first —
     waiting runs before agreed ones, because a run nobody has read is more
     urgent than one already signed. */
  const open = runs
    .filter((r) => r.status === "PENDING_APPROVAL" || r.status === "APPROVED")
    .sort((a, b) =>
      a.status === b.status
        ? (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0)
        : a.status === "PENDING_APPROVAL"
          ? -1
          : 1
    );

  const detailed = await Promise.all(open.map((r) => payrollRun(r.id)));
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title={t(locale, "Payroll")}
        description={t(
          locale,
          "What Finance has prepared, name by name. Agree it, send it back, or pay what you have already agreed."
        )}
      />

      {detailed.filter(Boolean).length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title={t(locale, "Nothing waiting")}
          description={t(
            locale,
            "Finance has not sent up a salary run, and nothing you agreed is still unpaid."
          )}
        />
      ) : (
        <div className="space-y-6">
          {detailed.filter(Boolean).map((run) => {
            const r = run!;
            const mine = r.preparedById === user.id;
            const waiting = r.status === "PENDING_APPROVAL";
            return (
              <div key={r.id}>
                <SectionLabel>
                  {r.code} ·{" "}
                  {waiting
                    ? t(locale, "waiting on you")
                    : t(locale, "agreed, not yet paid")}
                </SectionLabel>

                <div className="mb-2 flex flex-wrap items-baseline gap-x-6 gap-y-1 text-xs">
                  <span>
                    <span className="text-muted-foreground">{t(locale, "People")} </span>
                    <span className="tabular font-semibold">{r.totals.headcount}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">{t(locale, "Total")} </span>
                    <span className="tabular text-sm font-semibold">
                      {formatShillings(r.totals.net, rate)}
                    </span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">{t(locale, "From")} </span>
                    <span className="font-medium">
                      {r.account?.name ?? t(locale, "no account named")}
                    </span>
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {t(locale, "Prepared by")} {r.preparedBy.name}
                  </span>
                </div>

                {r.note ? (
                  <p className="mb-2 text-[11px] text-muted-foreground">
                    {t(locale, "Finance says:")} {r.note}
                  </p>
                ) : null}

                <PayrollTable
                  items={r.items}
                  locale={locale}
                  rate={rate}
                  editable={false}
                />

                <div className="mt-3">
                  {mine ? (
                    <p className="rounded-lg border border-warning/40 bg-warning/[0.04] px-3 py-2 text-[11px] text-muted-foreground">
                      {t(
                        locale,
                        "You built this run, so you cannot be the one who agrees it. Somebody else holding payroll approval has to read it."
                      )}
                    </p>
                  ) : waiting ? (
                    <DecideRunForm runId={r.id} />
                  ) : (
                    <PayRunForm
                      runId={r.id}
                      accountName={r.account?.name ?? t(locale, "the named account")}
                      today={today}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
