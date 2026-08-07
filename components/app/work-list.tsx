import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { formatUsd } from "@/lib/fx";

export type WorkItem = {
  /** Only rows that are true are passed in; a zero queue is not a row. */
  label: string;
  /** One sentence on why it matters, in the words the desk would use. */
  detail: string;
  href: string;
  /** Imperative: what pressing this starts. */
  cta: string;
  /**
   * Money at stake, in dollars. Rendered shillings-first. Omit entirely for a
   * queue that is not about an amount — a nought is not a priority, and a
   * column of them teaches people the column means nothing.
   */
  usd?: number;
  /** Shown in place of a figure, e.g. "already paid for", "3 days waiting". */
  aside?: string;
  /** Draws the bar. Reserve it: everything urgent is nothing urgent. */
  urgent?: boolean;
};

/**
 * What a desk is holding up, richest first.
 *
 * The pattern the owner asked to be repeated across departments. Each row is
 * one decision somebody here has to make, and carries three things a queue
 * needs to be worked: how much is behind it, why it matters, and the link that
 * clears it. A queue with no figure cannot be ranked; a warning with no link
 * teaches people to scroll past warnings.
 *
 * Deliberately headless. The SectionLabel above it is the heading — a panel
 * that repeats the section's name under the rule prints one heading twice.
 */
export function WorkList({
  items,
  empty,
  rate,
}: {
  items: WorkItem[];
  /** What the desk should read on a clear day. Say what is settled, not "none". */
  empty: string;
  /** USD→TZS. Null when no rate is published — then figures stay in dollars. */
  rate: number | null;
}) {
  const tsh = (usd: number) =>
    rate ? `TSh ${Math.round(usd * rate).toLocaleString("en-US")}` : formatUsd(usd);

  return (
    <section className="panel overflow-hidden">
      {items.length === 0 ? (
        <p className="px-5 py-9 text-center text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <ul className="divide-y">
          {items.map((item) => (
            <li key={item.label}>
              <Link
                href={item.href}
                className="focus-ring group flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3.5 transition-colors hover:bg-muted/40"
              >
                <span
                  className={`h-10 w-1 shrink-0 rounded-full ${
                    item.urgent ? "bg-warning" : "bg-border"
                  }`}
                  aria-hidden
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">
                    {item.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                    {item.detail}
                  </span>
                </span>
                <span className="text-right">
                  {item.usd !== undefined && item.usd > 0 ? (
                    <>
                      {/* Shillings lead. Freight is priced in dollars and paid
                          in shillings, and the desk on the phone is quoting
                          shillings. */}
                      <span className="block font-display text-lg font-bold leading-none tabular">
                        {tsh(item.usd)}
                      </span>
                      <span className="mt-1 block font-mono text-[11px] text-muted-foreground">
                        {formatUsd(item.usd)}
                      </span>
                    </>
                  ) : item.aside ? (
                    <span className="block text-xs text-muted-foreground">
                      {item.aside}
                    </span>
                  ) : null}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-brand">
                  {item.cta}
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
