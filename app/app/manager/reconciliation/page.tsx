import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Info, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { t } from "@/lib/i18n";
import { reconciliation } from "@/lib/reconciliation";
import { requirePermission } from "@/lib/session";
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
 */
export default async function ManagerReconciliation() {
  await requirePermission("report.view");
  const locale = await viewerLocale();
  const { checks, negative } = await reconciliation();

  const faults = checks.filter((c) => !c.ok).length;

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
