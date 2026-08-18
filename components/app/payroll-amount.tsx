import { formatShillings, formatUsd } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * One payroll figure, shillings leading and the dollars underneath.
 *
 * No "use client" of its own, deliberately. It holds no state and calls no
 * hook, so it compiles into whichever tree imports it — the two payroll pages
 * on the server, the line editor in the browser. Written four times instead,
 * the fourth copy is the one that quietly stops leading in shillings.
 */
export function PayrollAmount({
  usd,
  rate,
  strong = false,
  className,
}: {
  usd: number;
  /** Null when no rate is published; then there is only a dollar figure. */
  rate: number | null;
  /** For the figure that actually leaves the account. */
  strong?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("block leading-tight", className)}>
      <span
        className={cn(
          "block tabular",
          strong ? "font-display text-xs font-bold" : "text-xs font-medium"
        )}
      >
        {formatShillings(usd, rate)}
      </span>
      {/* Nothing underneath when no rate is published: formatShillings has
          already fallen back to the dollars, and the same figure printed twice
          reads as two amounts that happen to agree. */}
      {rate === null ? null : (
        <span className="block tabular text-[11px] font-normal text-muted-foreground">
          {formatUsd(usd)}
        </span>
      )}
    </span>
  );
}
