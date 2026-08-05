import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { formatUsd } from "@/lib/fx";
import { cn } from "@/lib/utils";

/**
 * A money figure, in both the currency it is priced in and the currency it is
 * paid in.
 *
 * This business quotes in dollars because the rate book is in dollars, and gets
 * paid in shillings because that is what customers have. Showing only one of
 * those means somebody at the counter is doing arithmetic in their head every
 * time a customer asks "so how much is that actually?" — and doing it at the
 * rate they remember rather than the rate on the invoice.
 *
 * The dollar figure leads because it is the one that settles the bill. The
 * shilling figure sits under it, marked as a conversion, because it moves with
 * the rate and must never be mistaken for the amount owed.
 */
export function MoneyTile({
  label,
  usd,
  rate,
  hint,
  icon: Icon,
  tone = "default",
  href,
  count,
}: {
  label: string;
  usd: number;
  /** Live USD→TZS rate. Null when none is published — then no conversion is shown. */
  rate: number | null;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "good" | "warn" | "bad" | "brand";
  href?: string;
  /** Optional "n things" line, e.g. how many invoices make up the figure. */
  count?: string;
}) {
  const TONES = {
    default: "text-foreground",
    good: "text-success",
    warn: "text-warning",
    bad: "text-destructive",
    brand: "text-brand",
  } as const;

  const body = (
    <div
      className={cn(
        "h-full rounded-xl border bg-card p-4 transition-shadow",
        href && "hover:shadow-lift"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-muted-foreground">{label}</p>
        {Icon ? <Icon className={cn("h-4 w-4 shrink-0", TONES[tone])} /> : null}
      </div>

      <p
        className={cn(
          "mt-2 font-display text-2xl font-bold leading-none tabular-nums",
          TONES[tone]
        )}
      >
        {formatUsd(usd)}
      </p>

      {/* The same money in shillings. Never presented as a second amount — it
          is the same amount, said in the currency the customer will hand over. */}
      {rate ? (
        <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
          ≈ TZS {Math.round(usd * rate).toLocaleString("en-US")}
        </p>
      ) : null}

      {count ? (
        <p className="mt-1.5 text-xs font-medium">{count}</p>
      ) : null}
      {hint ? (
        <p className={cn("text-xs text-muted-foreground", count ? "" : "mt-1.5")}>
          {hint}
        </p>
      ) : null}
    </div>
  );

  return href ? (
    <Link href={href} className="focus-ring block rounded-xl">
      {body}
    </Link>
  ) : (
    body
  );
}
