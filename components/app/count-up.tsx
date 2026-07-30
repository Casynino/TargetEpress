"use client";

import { useCountUp } from "@/lib/motion";

/**
 * The only part of a KPI card that needs to be interactive.
 *
 * Keeping the count-up in a leaf component means the card itself, its icon and
 * its ring all stay server-rendered — the client bundle carries a number
 * animation, not a whole dashboard.
 */
export function CountUp({
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  decimals?: number;
}) {
  const current = useCountUp(value);

  return (
    <span>
      {prefix}
      {current.toLocaleString("en-US", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}
      {suffix}
    </span>
  );
}
