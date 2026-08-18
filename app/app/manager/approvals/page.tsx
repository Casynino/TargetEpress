import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  FileText,
  ShieldCheck,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { approvalQueues } from "@/lib/approvals";
import { currentRate } from "@/lib/fx";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { formatShillings } from "@/lib/money";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Pending approvals" };

const ICONS: Record<string, LucideIcon> = {
  credit: CalendarClock,
  payments: ShieldCheck,
  drafts: FileText,
  claims: TriangleAlert,
};

/**
 * Everything waiting on a decision, and how long it has been waiting.
 *
 * The second column is the point of the page. Any of these queues can be opened
 * on its own screen, and on its own screen a backlog looks like a to-do list;
 * it is only next to the age of its oldest item that "eleven payments" becomes
 * "eleven payments, the oldest sitting nine days". Nine days is the finding. The
 * eleven is not.
 *
 * Nothing is decided here — every row opens the screen where the decision is
 * taken, with the evidence attached to it. A manager who cannot rule on one of
 * these still sees the row, greyed of its arrow: knowing Finance is behind is
 * the job even when signing it off is not.
 */
export default async function ManagerApprovals() {
  const user = await requirePermission("report.view");
  const locale = await viewerLocale();
  const [queues, rateRow] = await Promise.all([approvalQueues(), currentRate()]);
  const rate = rateRow ? toNumber(rateRow.rate) : null;

  const waiting = queues.filter((q) => q.count > 0);
  const clear = queues.filter((q) => q.count === 0);

  return (
    <>
      <PageHeader
        title={t(locale, "Pending approvals")}
        description={t(
          locale,
          "Every queue in the company that is waiting on somebody, oldest item first."
        )}
      />

      {waiting.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title={t(locale, "Nothing is waiting")}
          description={t(
            locale,
            "No credit request, payment, price or claim is sitting undecided."
          )}
        />
      ) : (
        <div className="space-y-2">
          {waiting.map((q) => {
            const Icon = ICONS[q.key] ?? BadgeCheck;
            const mine = can(user.role, q.permission);
            /* Aging is the alarm, not the count. A queue of one that nobody has
               looked at for a week is worse than a queue of twenty from today. */
            const stale = (q.oldestDays ?? 0) >= 3;
            return (
              <Link
                key={q.key}
                href={q.href}
                className="focus-ring group flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-brand/40 hover:bg-accent/40"
              >
                <span
                  className={
                    stale
                      ? "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive"
                      : "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground"
                  }
                >
                  <Icon className="h-4 w-4" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold">{t(locale, q.label)}</span>
                    <span className="tabular text-sm text-muted-foreground">
                      {q.count}
                    </span>
                    {q.oldestDays !== null ? (
                      <span
                        className={
                          stale
                            ? "text-[11px] font-semibold text-destructive"
                            : "text-[11px] text-muted-foreground"
                        }
                      >
                        {q.oldestDays === 0
                          ? t(locale, "oldest today")
                          : `${t(locale, "oldest")} ${q.oldestDays}${t(locale, "d")}`}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {t(locale, q.detail)}
                  </span>
                </span>

                {q.valueUsd !== null && q.valueUsd > 0 ? (
                  <span className="tabular shrink-0 text-right text-sm font-semibold">
                    {formatShillings(q.valueUsd, rate)}
                  </span>
                ) : null}

                {/* No arrow where the reader is watching rather than deciding.
                    The row still opens — reading the queue is not the ruling. */}
                <ArrowRight
                  className={
                    mine
                      ? "h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                      : "h-4 w-4 shrink-0 text-muted-foreground/25"
                  }
                />
              </Link>
            );
          })}
        </div>
      )}

      {clear.length > 0 && waiting.length > 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {t(locale, "Clear:")}{" "}
          {clear.map((q) => t(locale, q.label)).join(" · ")}
        </p>
      ) : null}
    </>
  );
}
