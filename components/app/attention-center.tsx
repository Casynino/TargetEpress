"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight, Info } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { SectionLabel } from "@/components/app/section-label";
import { cn } from "@/lib/utils";

export type AttnSeverity = "critical" | "warning" | "info";

export type AttnItem = {
  id: string;
  /** Which pill this sits under. Keep the set small — pills are a filter, not a menu. */
  group: string;
  severity: AttnSeverity;
  label: string;
  detail: string;
  href: string;
  /** Right-hand figure: an amount, a count, an age. Optional. */
  value?: string;
  /**
   * A second, quieter line under it. Shillings lead in this app and the dollar
   * figure is the reference — this is where the reference goes, so the money
   * desk does not lose it moving to this panel.
   */
  valueSub?: string;
};

const SEVERITY: Record<AttnSeverity, { icon: typeof AlertTriangle; text: string; bar: string }> = {
  critical: { icon: AlertTriangle, text: "text-destructive", bar: "bg-destructive" },
  warning: { icon: AlertTriangle, text: "text-warning", bar: "bg-warning" },
  info: { icon: Info, text: "text-info", bar: "bg-info" },
};

const RANK: Record<AttnSeverity, number> = { critical: 0, warning: 1, info: 2 };

/**
 * Three rows fit; the fourth is the reason the panel scrolls rather than grows.
 *
 * Kept deliberately low. This band sits above everything the desk came to the
 * page for, so every extra row it shows by default is a row of the actual work
 * pushed below the fold. Three is enough to see the shape of the queue and
 * short enough that the panel is never the page.
 */
const VISIBLE_ROWS = 3;

/**
 * Everything waiting on this desk, in one panel that never grows.
 *
 * The dashboards had two of these — an aggregate band counting the work and a
 * second list naming it — which meant the same case appeared twice under two
 * headings, and the page got longer every time a new kind of problem was added.
 * A queue that grows down the page stops being a queue and becomes a wall, and
 * a wall is scrolled past.
 *
 * So: one panel, fixed height, internal scroll, filtered by pills. Adding a new
 * kind of problem adds an AttnItem — never a new section. The count on each
 * pill is computed from the whole list rather than the visible page, because a
 * desk working a queue has to be able to trust the number on the pill.
 *
 * Ordered by severity, not by time. "What is worst" is the question this panel
 * answers; "what is newest" is what the activity feed is for.
 */
export function AttentionCenter({
  items,
  reviewAll,
  empty,
}: {
  items: AttnItem[];
  /** Where "Review all" goes. Omit and no link is drawn. */
  reviewAll?: { href: string; label?: string };
  empty: string;
}) {
  const t = useT();
  const groups = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(item.group, (counts.get(item.group) ?? 0) + 1);
    return [...counts.entries()];
  }, [items]);

  const [active, setActive] = useState<string>("All");

  const shown = useMemo(() => {
    const filtered = active === "All" ? items : items.filter((i) => i.group === active);
    return [...filtered].sort((a, b) => RANK[a.severity] - RANK[b.severity]);
  }, [items, active]);

  const hidden = Math.max(0, shown.length - VISIBLE_ROWS);

  return (
    <div>
      {/* The name lives in the rule above the panel, never inside it as well —
          "NEEDS YOUR ATTENTION" over a card headed the same thing is one
          heading printed twice, and it costs a whole row of height. See
          SectionLabel. */}
      <SectionLabel
        count={items.length}
        action={
          reviewAll && items.length > 0
            ? { href: reviewAll.href, label: reviewAll.label ?? t("Review all") }
            : undefined
        }
      >
        {t("Needs your attention")}
      </SectionLabel>

      <section className="panel overflow-hidden">
      {items.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <>
          {/* Pills only earn their place once there is more than one kind of
              problem — a single "All" pill is a label pretending to be a
              control. */}
          {groups.length > 1 ? (
            <div className="flex flex-wrap gap-1.5 border-b px-4 py-2">
              {[["All", items.length] as [string, number], ...groups].map(
                ([group, count]) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setActive(group)}
                    aria-pressed={active === group}
                    className={cn(
                      "focus-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                      active === group
                        ? "border-brand bg-brand text-brand-foreground"
                        : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {t(group)}
                    <span className="tabular-nums opacity-75">{count}</span>
                  </button>
                )
              )}
            </div>
          ) : null}

          {/* Fixed height, internal scroll. The panel is the same size whether
              this desk has three problems or thirty. */}
          <ul className="max-h-[10.5rem] divide-y overflow-y-auto">
            {shown.map((item) => {
              const meta = SEVERITY[item.severity];
              const Icon = meta.icon;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="focus-ring flex items-center gap-2.5 px-4 py-2 transition-colors hover:bg-muted/40"
                  >
                    <span
                      aria-hidden
                      className={cn("h-7 w-0.5 shrink-0 rounded-full", meta.bar)}
                    />
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", meta.text)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold leading-tight">
                        {item.label}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] leading-tight text-muted-foreground">
                        {item.detail}
                      </span>
                    </span>
                    {item.value ? (
                      <span className="shrink-0 text-right leading-tight">
                        <span className="block font-mono text-[11px] font-semibold tabular-nums">
                          {item.value}
                        </span>
                        {item.valueSub ? (
                          <span className="block font-mono text-[10px] tabular-nums text-muted-foreground">
                            {item.valueSub}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
            {shown.length === 0 ? (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nothing under {active}.
              </li>
            ) : null}
          </ul>

          {/* Said out loud, because a scroll area with no edge showing looks
              like the whole list. */}
          {hidden > 0 ? (
            <p className="flex items-center justify-center gap-1.5 border-t px-4 py-1.5 text-[11px] text-muted-foreground">
              <ChevronDown className="h-3 w-3" />
              scroll for {hidden} more
            </p>
          ) : null}
        </>
      )}
      </section>
    </div>
  );
}
