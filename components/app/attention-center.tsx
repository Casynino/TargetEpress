"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, ChevronRight, ChevronUp, Info } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
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
 * Exactly three rows show; the fourth is the reason the panel scrolls rather
 * than grows.
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

  return (
    <div>
      {/* The heading, sized as on Super Drive (owner, 8 Nov 2026): small
          spaced capitals and a cream count bubble, with this desk's own way
          into the full list on the right. */}
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          {t("Needs your attention")}
          {items.length > 0 ? (
            <span className="rounded-full bg-[#fdebc4] px-2 py-0.5 text-[11px] font-bold tracking-normal text-[#3a2a00]">
              {items.length}
            </span>
          ) : null}
        </h2>
        {reviewAll && items.length > 0 ? (
          <Link
            href={reviewAll.href}
            className="focus-ring shrink-0 rounded text-[11px] font-medium text-brand transition-colors hover:text-brand/80"
          >
            {reviewAll.label ?? t("Review all")}
          </Link>
        ) : null}
      </div>

      {/* Chips above the box, not inside it, and only once there is more
          than one kind of problem — a single "All" chip is a label pretending
          to be a control. */}
      {items.length > 0 && groups.length > 1 ? (
        <div className="mb-2 flex flex-wrap gap-1.5" role="tablist" aria-label={t("Filter")}>
          {[["All", items.length] as [string, number], ...groups].map(([group, count]) => (
            <button
              key={group}
              type="button"
              role="tab"
              aria-selected={active === group}
              onClick={() => setActive(group)}
              className={cn(
                "focus-ring rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                active === group
                  ? "bg-sky-500 text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              )}
            >
              {t(group)} <span className="opacity-60">{count}</span>
            </button>
          ))}
        </div>
      ) : null}

      {/* Flat, as on ORA and Super Drive: a hairline shadow, not a raised card. */}
      <section className="overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(15,27,45,0.04)]">
        {items.length === 0 ? (
          <p className="px-3.5 py-3 text-[13px] text-muted-foreground">{empty}</p>
        ) : shown.length === 0 ? (
          <p className="px-3.5 py-3 text-[13px] text-muted-foreground">
            {t("Nothing under")} {t(active)}.
          </p>
        ) : (
          <ShowRows key={active} total={shown.length}>
            <ul className="divide-y divide-border/60">
              {shown.map((item) => {
                const meta = SEVERITY[item.severity];
                const Icon = meta.icon;
                return (
                  <li key={item.id} data-row>
                    <Link
                      href={item.href}
                      className="group flex items-center gap-2.5 px-3.5 py-2.5 transition-colors hover:bg-muted/40"
                    >
                      <span aria-hidden className={cn("h-7 w-[3px] shrink-0 rounded-full", meta.bar)} />
                      <Icon className={cn("size-4 shrink-0", meta.text)} />
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 text-[13px] font-semibold leading-tight sm:line-clamp-1">
                          {item.label}
                        </span>
                        <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                          {/* On a phone the figure rides in this line, so the
                              title keeps the whole width. */}
                          {item.value ? (
                            <span className="font-medium text-foreground/80 sm:hidden">{item.value} · </span>
                          ) : null}
                          {item.detail}
                        </span>
                      </span>
                      {/* One line, as on ORA: the figure, and its quieter partner
                          (dollars, or how old) beside it rather than under it. */}
                      {item.value || item.valueSub ? (
                        <span className="hidden shrink-0 whitespace-nowrap text-right leading-tight sm:block">
                          {item.value ? (
                            <span className="text-[13px] font-bold tabular-nums">{item.value}</span>
                          ) : null}
                          {item.valueSub ? (
                            <span className="ml-1.5 text-[11px] tabular-nums text-muted-foreground">{item.valueSub}</span>
                          ) : null}
                        </span>
                      ) : null}
                      <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </ShowRows>
        )}
      </section>
    </div>
  );
}

/** Until the rows are measured (first paint) only the first three show, so nothing jumps. */
const HIDE_AFTER_3 = "[&_[data-row]:nth-child(n+4)]:hidden";

/**
 * Shows the first three rows (elements marked `data-row`); the rest are a
 * scroll away. The height is measured from the real rows, so exactly three fit
 * on every screen even when a title wraps on a phone. The bar underneath says
 * how many more there are and brings the next one up when pressed; at the end
 * it says "Back to the top". A soft edge says the list goes on. Copied from
 * Super Drive's panel (owner, 8 Nov 2026).
 */
function ShowRows({ total, children }: { total: number; children: ReactNode }) {
  const t = useT();
  const box = useRef<HTMLDivElement>(null);
  const [max, setMax] = useState<number | null>(null);
  const [below, setBelow] = useState(total - VISIBLE_ROWS);
  const extra = total - VISIBLE_ROWS;
  const parts = useCallback(() => {
    const el = box.current!;
    const rect = el.getBoundingClientRect();
    const rows = [...el.querySelectorAll<HTMLElement>("[data-row]")];
    const visibleBottom = rect.top + el.clientHeight;
    return { el, rect, rows, hidden: rows.filter((r) => r.getBoundingClientRect().bottom > visibleBottom + 1) };
  }, []);
  useLayoutEffect(() => {
    if (!box.current || extra <= 0) return;
    const measure = () => {
      const { el, rect, rows } = parts();
      const last = rows[VISIBLE_ROWS - 1];
      if (!last) return;
      setMax(Math.ceil(last.getBoundingClientRect().bottom - (rect.top - el.scrollTop)));
      requestAnimationFrame(() => box.current && setBelow(parts().hidden.length));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [extra, parts]);

  if (extra <= 0) return <div>{children}</div>;
  const step = () => {
    const { el, rect, hidden } = parts();
    if (!hidden.length) {
      el.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    el.scrollTo({ top: el.scrollTop + hidden[0].getBoundingClientRect().top - rect.top, behavior: "smooth" });
  };
  return (
    <div>
      <div className="relative">
        <div
          ref={box}
          className={cn("relative overflow-auto overscroll-contain [scrollbar-width:thin]", max === null && HIDE_AFTER_3)}
          style={max === null ? undefined : { maxHeight: max }}
          onScroll={() => setBelow(parts().hidden.length)}
        >
          {children}
        </div>
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-0 bottom-0 h-3 bg-gradient-to-t from-black/25 to-transparent transition-opacity dark:from-black/50",
            !below && "opacity-0",
          )}
        />
      </div>
      <button
        type="button"
        onClick={step}
        className="flex w-full items-center justify-center gap-1 border-t border-border/60 py-1.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
      >
        {below ? (
          <>
            <ChevronDown className="size-3" />
            {t("Scroll for")} {below} {t("more")}
          </>
        ) : (
          <>
            <ChevronUp className="size-3" />
            {t("Back to the top")}
          </>
        )}
      </button>
    </div>
  );
}
