import Link from "next/link";
import { ArrowRight, Info, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Small presentational pieces for the Developer console. The point of this
 * console is that the Developer should always understand what they are looking
 * at — so most of these carry a plain-language explanation next to the data.
 */

export type Tone = "good" | "warn" | "bad" | "info" | "neutral";

const chip: Record<Tone, string> = {
  good: "bg-success/15 text-success",
  warn: "bg-warning/15 text-warning",
  bad: "bg-destructive/15 text-destructive",
  info: "bg-info/15 text-info",
  neutral: "bg-muted text-muted-foreground",
};

const tint: Record<Tone, string> = {
  good: "border-success/25 bg-success/10",
  warn: "border-warning/30 bg-warning/10",
  bad: "border-destructive/30 bg-destructive/10",
  info: "border-info/25 bg-info/10",
  neutral: "border-border bg-muted/30",
};

export function SectionTitle({
  title,
  text,
  className,
}: {
  title: string;
  text?: string;
  className?: string;
}) {
  return (
    <div className={cn("mb-3", className)}>
      <h2 className="font-display text-base font-semibold tracking-tight">{title}</h2>
      {text && <p className="mt-0.5 max-w-3xl text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}

/** A tinted note that explains something. */
export function InfoCallout({
  icon: Icon = Info,
  tone = "info",
  title,
  children,
  className,
}: {
  icon?: LucideIcon;
  tone?: Tone;
  title?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-4", tint[tone], className)}>
      <span className={cn("mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg", chip[tone])}>
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 text-sm leading-relaxed">
        {title && <p className="font-semibold text-foreground">{title}</p>}
        <div className={cn("text-muted-foreground", title && "mt-0.5")}>{children}</div>
      </div>
    </div>
  );
}

/** A health number with a status chip and a "what this means" explanation. */
export function HealthCard({
  label,
  value,
  detail,
  tone,
  statusText,
  icon: Icon,
  meaning,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
  tone: Tone;
  statusText: string;
  icon: LucideIcon;
  meaning: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-xl border border-border bg-card shadow-soft">
      <div className="flex items-start justify-between gap-3 p-5 pb-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-2 font-display text-3xl font-semibold tracking-tight tabular-nums">{value}</p>
          {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
        </div>
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl", chip[tone])}>
          <Icon className="size-5" />
        </span>
      </div>
      <div className="mt-auto space-y-2 border-t border-border bg-muted/20 px-5 py-3.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
            chip[tone],
          )}
        >
          {statusText}
        </span>
        <p className="text-xs leading-relaxed text-muted-foreground">{meaning}</p>
      </div>
    </div>
  );
}

/** A big, clickable card that sends the Developer somewhere, saying what it's for. */
export function QuickLink({
  href,
  icon: Icon,
  title,
  text,
}: {
  href: string;
  icon: LucideIcon;
  title: string;
  text: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-start gap-3.5 rounded-xl border border-border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          {title}
          <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
        </span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{text}</span>
      </span>
    </Link>
  );
}
