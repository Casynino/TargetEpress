import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShieldCheck, TriangleAlert } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { controlRoom } from "@/lib/control";
import { t } from "@/lib/i18n";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Control room" };

/**
 * Everything waiting on this desk, worst first.
 *
 * ONE LIST, AND IT DECIDES NOTHING. Every line opens the screen that owns the
 * ruling, with its guard and its evidence attached. A second surface that also
 * approved things would be a second code path to the same decision, and one of
 * them would drift out of step with the other's checks.
 *
 * The age column beside each count is the reason this page exists. A queue of
 * eleven that arrived this morning is a normal Tuesday; a queue of one nobody
 * has touched in nine days is the thing that needs a manager, and only the age
 * tells them apart. Sorted so that something failing outranks something merely
 * waiting, then by how long it has waited.
 */
export default async function ControlRoom() {
  await requirePermission("report.view");
  const locale = await viewerLocale();
  const lines = await controlRoom();

  const bad = lines.filter((l) => l.tone === "bad").length;

  return (
    <>
      <PageHeader
        title={t(locale, "Control room")}
        description={t(
          locale,
          "Everything waiting on you, and how long it has been waiting."
        )}
      />

      {lines.length === 0 ? (
        <p className="rounded-xl border border-success/40 bg-success/[0.05] px-3 py-2.5 text-sm font-medium text-success">
          <ShieldCheck className="mr-1.5 inline h-4 w-4" />
          {t(
            locale,
            "Nothing is waiting on you. Every queue is clear, every account has been checked, and nothing is in dispute."
          )}
        </p>
      ) : (
        <>
          <p
            className={
              bad > 0
                ? "mb-3 text-[11px] font-semibold uppercase tracking-wide text-destructive"
                : "mb-3 text-[11px] font-semibold uppercase tracking-wide text-warning"
            }
          >
            {bad > 0
              ? `${bad} ${t(locale, bad === 1 ? "thing needs a decision now" : "things need a decision now")}`
              : t(locale, "Nothing urgent — these are waiting on you")}
          </p>

          <div className="space-y-1.5">
            {lines.map((l) => (
              <Link
                key={l.key}
                href={l.href}
                className="focus-ring group flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors hover:border-brand/40 hover:bg-accent/40"
              >
                <span
                  className={
                    l.tone === "bad"
                      ? "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive"
                      : "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-warning/10 text-warning"
                  }
                >
                  <TriangleAlert className="h-4 w-4" />
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-sm font-semibold">
                      {t(locale, l.label)}
                    </span>
                    <span className="tabular text-sm text-muted-foreground">
                      {l.count}
                    </span>
                    {/* The age, where there is one. Some lines are a state
                        rather than a queue — an account that never balanced has
                        no "oldest item" — and inventing a zero there would read
                        as "dealt with today". */}
                    {l.oldestDays !== null ? (
                      <span
                        className={
                          l.oldestDays >= 3
                            ? "text-[11px] font-semibold text-destructive"
                            : "text-[11px] text-muted-foreground"
                        }
                      >
                        {l.oldestDays === 0
                          ? t(locale, "since today")
                          : `${t(locale, "oldest")} ${l.oldestDays}${t(locale, "d")}`}
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">
                    {t(locale, l.detail)}
                  </span>
                </span>

                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              </Link>
            ))}
          </div>
        </>
      )}

      {/*
        Said once, quietly, because a manager will otherwise wonder where it is.
        The owner's spec asks for a "large expenses require review" line; nothing
        in this system defines what large means, and choosing a figure here would
        be inventing company policy inside a display.
      */}
      <p className="mt-4 text-[11px] text-muted-foreground">
        {t(
          locale,
          "Expenses are not flagged by size — no threshold has been set for what counts as a large one. Every expense is reviewable under Transactions."
        )}
      </p>
    </>
  );
}
