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
  critical: { icon: XCircle, bar: "bg-destructive", text: "text-destructive" },
  warning: { icon: AlertTriangle, bar: "bg-warning", text: "text-warning" },
  info: { icon: Info, bar: "bg-info", text: "text-info" },
} as const;

/** Rows shown at once; the rest are behind a scroll. */
const VISIBLE = 3;

/**
 * THE ATTENTION LIST: three one-line rows, the rest behind a scroll.
 *
 * Each row is a coloured edge, an icon and one line — what it is, and a little
 * of why. Tap it for what to do. Small on purpose: the page below is the point,
 * and a healthy system shows none of this at all.
 */
export function AttentionList({ problems }: { problems: AttentionItem[] }) {
  const [atEnd, setAtEnd] = useState(false);
  const hidden = Math.max(0, problems.length - VISIBLE);

  return (
    <div>
      <div
        className="max-h-[7.5rem] overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtEnd(el.scrollTop + el.clientHeight >= el.scrollHeight - 4);
        }}
      >
        {problems.map((p) => {
          const l = LEVEL[p.level];
          const Icon = l.icon;
          return (
            <details
              key={p.title}
              className="group border-b border-border last:border-b-0"
            >
              <summary className="flex h-10 cursor-pointer list-none items-stretch pr-3 hover:bg-muted/40 [&::-webkit-details-marker]:hidden">
                <span className={cn("w-0.5 shrink-0", l.bar)} />
                <span className="flex min-w-0 flex-1 items-center gap-2.5 pl-3">
                  <Icon className={cn("size-4 shrink-0", l.text)} />
                  <span className="min-w-0 flex-1 truncate text-sm">
                    <span className="font-semibold">{p.title}</span>
                    <span className="text-muted-foreground"> · {p.detail}</span>
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                </span>
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
        <p className="flex items-center justify-center gap-1 border-t border-border bg-muted/20 py-1 text-xs text-muted-foreground">
          <ChevronDown className="size-3.5" /> scroll for {hidden} more
        </p>
      )}
    </div>
  );
}
