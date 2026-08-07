import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * The small uppercase rule above a block of a dashboard.
 *
 * A dashboard is several unrelated answers stacked vertically. Without a label
 * at the top of each one the reader has to infer where a section starts from
 * the shape of its contents, which works until two sections happen to be the
 * same shape.
 *
 * The label carries the section's name and nothing else. Where a panel sits
 * underneath it, that panel must NOT repeat the name — "NEEDS YOUR ATTENTION"
 * over a card headed "What needs you" is one heading printed twice, and reads
 * as two things until you work out it is one.
 */
export function SectionLabel({
  children,
  count,
  action,
}: {
  children: React.ReactNode;
  /** Shown as a chip beside the name, e.g. the number of items below. */
  count?: number;
  /** For a section that has a fuller version on its own page. */
  action?: { href: string; label: string };
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {children}
        {count !== undefined && count > 0 ? (
          <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-bold leading-none text-warning">
            {count}
          </span>
        ) : null}
      </h2>
      {action ? (
        <Link
          href={action.href}
          className="focus-ring inline-flex shrink-0 items-center gap-1 rounded text-xs font-semibold text-brand hover:underline"
        >
          {action.label}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      ) : null}
    </div>
  );
}
