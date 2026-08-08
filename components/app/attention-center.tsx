"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight, Clock, Info } from "lucide-react";

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
};

const SEVERITY: Record<AttnSeverity, { icon: typeof AlertTriangle; text: string; bar: string }> = {
  critical: { icon: AlertTriangle, text: "text-destructive", bar: "bg-destructive" },
  warning: { icon: AlertTriangle, text: "text-warning", bar: "bg-warning" },
  info: { icon: Info, text: "text-info", bar: "bg-info" },
};

const RANK: Record<AttnSeverity, number> = { critical: 0, warning: 1, info: 2 };

/** Four rows fit; the fifth is the reason the panel scrolls rather than grows. */
const VISIBLE_ROWS = 4;

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
    <section className="panel overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <h2 className="font-display font-semibold">Needs your attention</h2>
          {items.length > 0 ? (
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand/15 px-1.5 text-[11px] font-semibold tabular-nums text-brand">
              {items.length}
            </span>
          ) : null}
        </div>
        {reviewAll && items.length > 0 ? (
          <Link
            href={reviewAll.href}
            className="focus-ring rounded text-xs font-semibold text-brand hover:underline"
          >
            {reviewAll.label ?? "Review all"}
          </Link>
        ) : null}
      </header>

      {items.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-muted-foreground">{empty}</p>
      ) : (
        <>
          {/* Pills only earn their place once there is more than one kind of
              problem — a single "All" pill is a label pretending to be a
              control. */}
          {groups.length > 1 ? (
            <div className="flex flex-wrap gap-1.5 border-b px-5 py-3">
              {[["All", items.length] as [string, number], ...groups].map(
                ([group, count]) => (
                  <button
                    key={group}
                    type="button"
                    onClick={() => setActive(group)}
                    aria-pressed={active === group}
                    className={cn(
                      "focus-ring inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      active === group
                        ? "border-brand bg-brand text-brand-foreground"
                        : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {group}
                    <span className="tabular-nums opacity-75">{count}</span>
                  </button>
                )
              )}
            </div>
          ) : null}

          {/* Fixed height, internal scroll. The panel is the same size whether
              this desk has three problems or thirty. */}
          <ul className="max-h-[17.5rem] divide-y overflow-y-auto">
            {shown.map((item) => {
              const meta = SEVERITY[item.severity];
              const Icon = meta.icon;
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="focus-ring flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
                  >
                    <span
                      aria-hidden
                      className={cn("h-8 w-0.5 shrink-0 rounded-full", meta.bar)}
                    />
                    <Icon className={cn("h-4 w-4 shrink-0", meta.text)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {item.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {item.detail}
                      </span>
                    </span>
                    {item.value ? (
                      <span className="shrink-0 text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {item.value}
                      </span>
                    ) : null}
                    <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
            {shown.length === 0 ? (
              <li className="px-5 py-8 text-center text-sm text-muted-foreground">
                Nothing under {active}.
              </li>
            ) : null}
          </ul>

          {/* Said out loud, because a scroll area with no edge showing looks
              like the whole list. */}
          {hidden > 0 ? (
            <p className="flex items-center justify-center gap-1.5 border-t px-5 py-2 text-[11px] text-muted-foreground">
              <ChevronDown className="h-3 w-3" />
              scroll for {hidden} more
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
