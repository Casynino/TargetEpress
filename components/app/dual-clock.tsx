"use client";

import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Two clocks, because this business runs in two time zones five hours apart.
 *
 * A Guangzhou desk sealing a batch at 6pm is sealing it at 1pm in Dar; the
 * question "can I still ring the office" has a different answer at each end of
 * the route, and getting it wrong wastes an evening.
 *
 * Rendered empty on the server and filled in on mount. A clock is the one thing
 * on a page that is guaranteed to be wrong by the time HTML reaches a browser,
 * so hydrating it from the client's own tick avoids a mismatch.
 */
const ZONES = {
  CN: { label: "China", zone: "Asia/Shanghai", offset: "GMT+8", flag: "🇨🇳" },
  TZ: { label: "Tanzania", zone: "Africa/Dar_es_Salaam", offset: "GMT+3", flag: "🇹🇿" },
} as const;

export function DualClock({
  emphasis = "CN",
  className,
}: {
  /** Whose local time is the big one — the warehouse you are standing in. */
  emphasis?: "CN" | "TZ";
  className?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  const order: ("CN" | "TZ")[] = emphasis === "CN" ? ["CN", "TZ"] : ["TZ", "CN"];

  return (
    <div className={cn("flex items-center gap-5", className)}>
      {order.map((key, index) => {
        const zone = ZONES[key];
        const primary = index === 0;
        return (
          <div key={key} className={primary ? "" : "opacity-70"}>
            <p
              className={cn(
                "flex items-center gap-1.5 leading-none",
                primary ? "text-xs" : "text-xs"
              )}
            >
              <span aria-hidden>{zone.flag}</span>
              {zone.label}
            </p>
            <p
              className={cn(
                "font-display font-bold tabular leading-none",
                primary ? "mt-1 text-2xl" : "mt-1 text-base"
              )}
            >
              {now
                ? now.toLocaleTimeString("en-GB", {
                    timeZone: zone.zone,
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "--:--"}
            </p>
            <p className="mt-0.5 text-xs opacity-70">{zone.offset}</p>
          </div>
        );
      })}
    </div>
  );
}
