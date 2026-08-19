import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Info } from "lucide-react";

import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";

/**
 * The things that genuinely need this desk, and nothing else.
 *
 * BUILT FROM QUEUES THAT ARE REAL, never padded. If nothing is waiting the panel
 * says so in one calm line — an empty dashboard section is a worse lie than an
 * alarming one, because it teaches the reader that the section means nothing.
 *
 * Each row carries four things because a manager deciding whether to act needs
 * all four: WHAT happened, WHY it matters, HOW LONG it has waited, and WHERE to
 * go. The age is the part most dashboards drop and it is the part that turns a
 * count into a decision — eleven payments is a Tuesday, eleven payments with the
 * oldest nine days old is a problem.
 *
 * Ordered by urgency, not by category. A manager reads down until they stop
 * caring, so the order has to be the order they would have chosen.
 */
export type AttnRow = {
  key: string;
  /** What happened, in the fewest words that are still specific. */
  title: string;
  /** Why it matters — the consequence, not a restatement of the title. */
  why: string;
  /** How long the oldest one has waited. Null when the queue has no age. */
  ageDays: number | null;
  /** A figure where money is riding on it. */
  value?: string;
  href: string;
  action: string;
  severity: "critical" | "warning" | "info";
};

const TONES = {
  critical: { rail: "bg-destructive", icon: AlertTriangle, text: "text-destructive" },
  warning: { rail: "bg-warning", icon: AlertTriangle, text: "text-warning" },
  info: { rail: "bg-info", icon: Info, text: "text-info" },
} as const;

export function ManagerAttention({
  locale,
  rows,
}: {
  locale: Locale;
  rows: AttnRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="mb-6 flex items-center gap-2.5 rounded-xl border border-success/40 bg-success/[0.05] px-4 py-3">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
        <p className="text-sm font-medium text-success">
          {t(locale, "Everything is up to date. Nothing is waiting on you.")}
        </p>
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-1.5">
      {rows.map((r) => {
        const tone = TONES[r.severity];
        const Icon = tone.icon;
        return (
          <Link
            key={r.key}
            href={r.href}
            /* Stacks on a phone, one line on a desktop.

               Four columns — rail, icon, text, figure, button — is right at
               1600px and cruel at 390: the reason wrapped to three lines while
               the button squeezed against the edge beside it. Below sm the
               figure and the action drop onto their own row under the text,
               where both have room. */
            className="focus-ring group relative flex flex-wrap items-start gap-x-3 gap-y-2 overflow-hidden rounded-xl border bg-card py-3 pl-4 pr-3 transition-colors hover:border-foreground/20 hover:bg-accent/30 sm:flex-nowrap"
          >
            <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", tone.rail)} />
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone.text)} />

            <span className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-sm font-semibold">{r.title}</span>
                {/* The age, where the queue has one. Bold past three days,
                    because that is where waiting stops being normal. */}
                {r.ageDays !== null ? (
                  <span
                    className={cn(
                      "text-[11px]",
                      r.ageDays >= 3
                        ? "font-semibold text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {r.ageDays === 0
                      ? t(locale, "since today")
                      : `${t(locale, "oldest")} ${r.ageDays}${t(locale, "d")}`}
                  </span>
                ) : null}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                {r.why}
              </span>
            </span>

            {r.value ? (
              <span className="ml-7 shrink-0 self-center text-sm font-semibold tabular-nums sm:ml-0">
                {r.value}
              </span>
            ) : null}

            <span className="focus-ring ml-auto inline-flex shrink-0 items-center gap-1 self-center rounded-md border px-2.5 py-1 text-[11px] font-semibold transition-colors group-hover:border-foreground/30 group-hover:bg-background sm:ml-0">
              {r.action}
              <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
