import { formatLocal, formatShillings, formatUsd } from "@/lib/money";
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
  paid = null,
  strong = false,
  className,
}: {
  usd: number;
  /** Null when no rate is published; then there is only a dollar figure. */
  rate: number | null;
  /**
   * The figure as the bank actually moved it, for a run already PAID: the
   * expense's own amount and currency, frozen on the day of payment. When
   * present it replaces the conversion at `rate` — a paid month must keep
   * saying what it said on the day, whatever the rate has done since.
   */
  paid?: { amount: number; currency: string } | null;
  /** For the figure that actually leaves the account. */
  strong?: boolean;
  className?: string;
}) {
  const lead = paid
    ? paid.currency === "USD"
      ? formatUsd(paid.amount)
      : formatLocal(paid.amount, paid.currency)
    : formatShillings(usd, rate);
  /* Nothing underneath when the lead already is the dollar figure — no rate
     published, or the salaries were paid out in dollars: the same figure
     printed twice reads as two amounts that happen to agree. */
  const secondary =
    (paid ? paid.currency === "USD" : rate === null) ? null : formatUsd(usd);

  return (
    <span className={cn("block leading-tight", className)}>
      <span
        className={cn(
          "block tabular",
          strong ? "font-display text-xs font-bold" : "text-xs font-medium"
        )}
      >
        {lead}
      </span>
      {secondary === null ? null : (
        <span className="block tabular text-[11px] font-normal text-muted-foreground">
          {secondary}
        </span>
      )}
    </span>
  );
}
