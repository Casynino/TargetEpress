"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Info,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type AttentionItem = {
  level: "critical" | "warning" | "info";
  title: string;
  detail: string;
  hint: string;
  href?: string;
  items?: string[];
  group: string;
};

const LEVEL = {
  critical: {
    icon: XCircle,
    bar: "bg-destructive",
    text: "text-destructive",
    chip: "Fix now",
  },
  warning: {
    icon: AlertTriangle,
    bar: "bg-warning",
    text: "text-warning",
    chip: "Look",
  },
  info: { icon: Info, bar: "bg-info", text: "text-info", chip: "Note" },
} as const;

/** Rows shown before the list scrolls. */
const VISIBLE = 4;

/**
 * THE ATTENTION LIST: compact rows, filter chips, a fixed height that scrolls.
 *
 * A coloured edge and an icon say how bad it is, one line says what it is, and
 * a tap opens what to do. It never grows past about four rows — the page below
 * is the point, not this list — and says how many more are hidden.
 */
export function AttentionList({ problems }: { problems: AttentionItem[] }) {
  const groups = [...new Set(problems.map((p) => p.group))];
  const [group, setGroup] = useState("All");
  const [atEnd, setAtEnd] = useState(false);
  const shown =
    group === "All" ? problems : problems.filter((p) => p.group === group);
  const hidden = Math.max(0, shown.length - VISIBLE);

  return (
    <div>
      {groups.length > 1 && (
        <div className="flex flex-wrap gap-1.5 border-b border-border px-3 py-2.5">
          {["All", ...groups].map((g) => {
            const n =
              g === "All"
                ? problems.length
                : problems.filter((p) => p.group === g).length;
            const on = g === group;
            return (
              <button
                key={g}
                type="button"
                onClick={() => {
                  setGroup(g);
                  setAtEnd(false);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                  on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {g}
                <span className="tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      <div
        className="max-h-[17.5rem] overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
        }}
      >
        {shown.map((p) => {
          const l = LEVEL[p.level];
          const Icon = l.icon;
          return (
            <details
              key={p.title}
              className="group border-b border-border last:border-b-0"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 py-2.5 pr-3 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                <span
                  className={cn("w-0.5 self-stretch rounded-full", l.bar)}
                />
                <Icon className={cn("size-4 shrink-0", l.text)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold leading-tight">
                    {p.title}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {p.detail}
                  </span>
                </span>
                <span
                  className={cn(
                    "hidden shrink-0 text-[10px] font-semibold uppercase tracking-wide sm:inline",
                    l.text,
                  )}
                >
                  {l.chip}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
              </summary>
              <div className="space-y-1.5 border-t border-border/60 bg-muted/20 py-3 pl-[2.6rem] pr-4 text-sm leading-relaxed">
                <p className="text-muted-foreground">{p.detail}</p>
                <p>
                  <span className="font-semibold">What to do: </span>
                  {p.hint}
                </p>
                {p.items?.length ? (
                  <ul className="space-y-0.5 rounded-lg bg-background/60 px-3 py-2 font-mono text-xs text-muted-foreground">
                    {p.items.map((it) => (
                      <li key={it}>{it}</li>
                    ))}
                  </ul>
                ) : null}
                {p.href ? (
                  <Link
                    href={p.href}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    Look at it <ChevronRight className="size-3.5" />
                  </Link>
                ) : null}
              </div>
            </details>
          );
        })}
      </div>

      {hidden > 0 && !atEnd && (
        <p className="flex items-center justify-center gap-1 border-t border-border bg-muted/20 py-1.5 text-xs text-muted-foreground">
          <ChevronDown className="size-3.5" /> scroll for {hidden} more
        </p>
      )}
    </div>
  );
}
