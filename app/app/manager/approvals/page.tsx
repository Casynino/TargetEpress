import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  FileText,
  History,
  PlaneLanding,
  ShieldCheck,
  TriangleAlert,
  Wallet,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { IconHint } from "@/components/app/icon-hint";
import { PageHeader } from "@/components/app/page-header";
import { approvalQueues, decisionHistory } from "@/lib/approvals";
import { auditSentence } from "@/lib/audit-humanise";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDateTime, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { formatShillings } from "@/lib/money";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Approvals" };

const ICONS: Record<string, LucideIcon> = {
  credit: CalendarClock,
  payments: ShieldCheck,
  drafts: FileText,
  statements: PlaneLanding,
  payroll: Wallet,
  claims: TriangleAlert,
};

type View = "waiting" | "approved" | "rejected";

/**
 * Everything waiting on a decision, how long it has been waiting, and what has
 * lately been decided.
 *
 * The second column is the point of the board. Any of these queues can be
 * opened on its own screen, and on its own screen a backlog looks like a to-do
 * list; it is only next to the age of its oldest item that "eleven payments"
 * becomes "eleven payments, the oldest sitting nine days". Nine days is the
 * finding. The eleven is not.
 *
 * Nothing is decided here — every row opens the screen where the decision is
 * taken, with the evidence attached to it. A manager who cannot rule on one of
 * these still sees the row, greyed of its arrow: knowing Finance is behind is
 * the job even when signing it off is not.
 *
 * The decided half is read off the audit log, not recorded again, and it sits
 * behind the same filter as the waiting half rather than stacked under it. A
 * board that grows a second list every time it learns something new stops
 * fitting on a screen, and this one is read by somebody who has half a minute
 * for it. Switching away from Waiting never hides a backlog: the banner at the
 * top of the decided views carries the count and the age across with it.
 */
export default async function ManagerApprovals({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requirePermission("report.view");
  const locale = await viewerLocale();
  const { view } = await searchParams;
  const tab: View = view === "approved" || view === "rejected" ? view : "waiting";

  const [queues, decided, rateRow] = await Promise.all([
    approvalQueues(),
    decisionHistory(),
    currentRate(),
  ]);
  const rate = rateRow ? toNumber(rateRow.rate) : null;

  const waiting = queues.filter((q) => q.count > 0);
  const clear = queues.filter((q) => q.count === 0);
  /* Items, not queues. "Four queues" is a fact about this page's layout; what
     the manager is being told is how many things are sitting. */
  const waitingCount = waiting.reduce((n, q) => n + q.count, 0);
  const oldestDays = Math.max(0, ...waiting.map((q) => q.oldestDays ?? 0));

  const approved = decided.filter((d) => d.outcome === "approved");
  const rejected = decided.filter((d) => d.outcome === "rejected");
  const rows = tab === "approved" ? approved : tab === "rejected" ? rejected : [];

  const chip =
    "focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors";
  const tabs: { key: View; label: string; count: number }[] = [
    { key: "waiting", label: "Waiting", count: waitingCount },
    { key: "approved", label: "Approved", count: approved.length },
    { key: "rejected", label: "Sent back", count: rejected.length },
  ];

  return (
    <>
      <PageHeader
        title={t(locale, "Approvals")}
        description={t(
          locale,
          "Every queue in the company that is waiting on somebody, oldest item first — and what has lately been ruled on."
        )}
      />

      {/* The whole board behind one control. Each count is of what its own view
          actually holds, so a pill reading zero is a promise the view is empty
          rather than an invitation to go and check. */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {tabs.map((option) => (
          <Link
            key={option.key}
            href={
              option.key === "waiting"
                ? "/app/manager/approvals"
                : `/app/manager/approvals?view=${option.key}`
            }
            aria-current={tab === option.key ? "page" : undefined}
            className={cn(
              chip,
              tab === option.key
                ? "border-brand bg-brand text-white"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {t(locale, option.label)}
            <span className="tabular ml-1.5 opacity-70">{option.count}</span>
          </Link>
        ))}
      </div>

      {/* The alarm follows the reader. A backlog that vanishes the moment
          somebody looks at last week's rulings is a backlog nobody clears. */}
      {tab !== "waiting" && waitingCount > 0 ? (
        <Link
          href="/app/manager/approvals"
          className={cn(
            "focus-ring mb-3 flex flex-wrap items-baseline gap-x-1.5 rounded-lg border px-3 py-2 text-[11px] font-medium",
            oldestDays >= 3
              ? "border-destructive/40 bg-destructive/[0.05] text-destructive"
              : "border-warning/40 bg-warning/[0.05] text-warning"
          )}
        >
          <span className="tabular">{waitingCount}</span>
          <span>{t(locale, "still waiting")}</span>
          <span className="opacity-80">
            ·{" "}
            {oldestDays === 0
              ? t(locale, "oldest today")
              : `${t(locale, "oldest")} ${oldestDays}${t(locale, "d")}`}
          </span>
        </Link>
      ) : null}

      {tab === "waiting" ? (
        waiting.length === 0 ? (
          <EmptyState
            icon={BadgeCheck}
            title={t(locale, "Nothing is waiting")}
            description={t(
              locale,
              "No credit request, payment, price, flight statement, salary run or claim is sitting undecided."
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
        )
      ) : rows.length === 0 ? (
        <EmptyState
          icon={History}
          title={
            tab === "approved"
              ? t(locale, "Nothing agreed yet")
              : t(locale, "Nothing sent back")
          }
          description={t(
            locale,
            "Rulings appear here the moment they are made, on the screen that makes them."
          )}
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((d) => {
            const ruled = d.outcome === "approved";
            return (
              <li key={d.id}>
                <Link
                  href={d.href}
                  className="focus-ring flex items-start gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-brand/40 hover:bg-accent/40"
                >
                  {/* Icon-only, so it is named on hover and on tab-through. The
                      raw action code stays on the title, for whoever wants to
                      paste it into the audit log's search box. */}
                  <IconHint
                    label={t(locale, ruled ? "Approved" : "Sent back")}
                    className="mt-0.5 shrink-0"
                  >
                    <span
                      title={d.action}
                      className={
                        ruled
                          ? "grid h-7 w-7 place-items-center rounded-lg bg-success/10 text-success"
                          : "grid h-7 w-7 place-items-center rounded-lg bg-destructive/10 text-destructive"
                      }
                    >
                      {ruled ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <XCircle className="h-3.5 w-3.5" />
                      )}
                    </span>
                  </IconHint>

                  <span className="min-w-0 flex-1">
                    {/* The stored row, said in the reader's language by the one
                        humaniser there is. Every send-back in this system writes
                        its reason into that sentence, so the "why" is this line
                        and not a second one under it. */}
                    <span className="block text-sm">{auditSentence(locale, d)}</span>
                    <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                      {d.actor ?? t(locale, "System")}
                      {d.role ? ` · ${t(locale, ROLE_LABELS[d.role])}` : ""}
                      {" · "}
                      {formatDateTime(d.at, locale)}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {tab === "waiting" && clear.length > 0 && waiting.length > 0 ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {t(locale, "Clear:")}{" "}
          {clear.map((q) => t(locale, q.label)).join(" · ")}
        </p>
      ) : null}

      {tab !== "waiting" ? (
        <p className="mt-3 text-[11px] text-muted-foreground">
          {t(
            locale,
            "The last 30 of each. Prices confirmed and payments verified are left out — they run to dozens a day and would bury the rest."
          )}
          {can(user.role, "audit.view") ? (
            <>
              {" "}
              <Link
                href="/app/admin/audit"
                className="focus-ring rounded underline-offset-2 hover:underline"
              >
                {t(locale, "The full log has them.")}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}
    </>
  );
}
