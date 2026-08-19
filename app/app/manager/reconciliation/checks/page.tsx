import type { Metadata } from "next";
import { AlertTriangle, BadgeCheck } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { ReconcileNav } from "@/components/app/reconcile-nav";
import { toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { formatShillings } from "@/lib/money";
import { reconciliation } from "@/lib/reconciliation";
import { reconciliationTabCounts } from "@/lib/reconciliation-workspace";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "The books' own checks" };

/**
 * THE ARITHMETIC, WHICH NEEDS NO VERDICT.
 *
 * Every other tab in this workspace asks the manager for a judgement. This one
 * asks nothing: each figure is fetched twice by two different routes, and where
 * the two answers differ something is wrong with the books rather than with
 * somebody's honesty. A fault to chase, not a record to judge — which is why it
 * has its own tab instead of sitting between him and the queue.
 */
export default async function ReconciliationChecks() {
  await requirePermission("report.view");
  const locale = await viewerLocale();
  const [checks, rateRow] = await Promise.all([reconciliation(locale), currentRate()]);
  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const shillings = (usd: number) => formatShillings(usd, rate);
  const faults = checks.checks.filter((check) => !check.ok);

  const tabCounts = await reconciliationTabCounts();

  return (
    <>
      <PageHeader
        title={t(locale, "The books against themselves")}
        description={t(
          locale,
          "Each figure asked twice, by two different routes. Where the two answers differ, the difference is here."
        )}
      />
      <ReconcileNav counts={tabCounts} />

        <div className="rounded-xl border bg-card p-4 shadow-soft">
        <p className="text-xs leading-snug text-muted-foreground">
          {t(
            locale,
            "Each figure asked twice, by two different routes. These need no verdict — they are arithmetic, and a disagreement is a fault to chase."
          )}
        </p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {checks.checks.map((check) => (
            <li
              key={check.key}
              className={cn(
                "rounded-lg border p-3 text-xs",
                check.ok ? "bg-muted/10" : "border-destructive/40 bg-destructive/[0.04]"
              )}
            >
              <p className="flex items-center gap-1.5 font-semibold">
                {check.ok ? (
                  <BadgeCheck className="h-3.5 w-3.5 text-success" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                )}
                {check.label}
              </p>
              <p className="mt-1 leading-snug text-muted-foreground">{check.question}</p>
              {/* In shillings when the side IS money — the engine writes its
                  figures in dollars and every other number on this screen
                  leads in the currency of the room. A side that counts things
                  rather than money carries no usd and prints as written. */}
              <p className="mt-1 flex flex-wrap items-baseline gap-x-3 font-mono tabular-nums">
                <span>
                  <span className="text-muted-foreground">{check.left.label} </span>
                  {check.left.usd !== undefined ? shillings(check.left.usd) : check.left.value}
                </span>
                <span>
                  <span className="text-muted-foreground">{check.right.label} </span>
                  {check.right.usd !== undefined ? shillings(check.right.usd) : check.right.value}
                </span>
              </p>
              {check.expected ? (
                <p className="mt-1 leading-snug text-muted-foreground">{check.expected}</p>
              ) : null}
            </li>
          ))}
        </ul>
        {faults.length > 0 ? (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/[0.05] px-3 py-2 text-xs font-medium text-destructive">
            {faults.length} {t(locale, "check(s) disagree — chase these before agreeing the month.")}
          </p>
        ) : null}
      </div>
    </>
  );
}
