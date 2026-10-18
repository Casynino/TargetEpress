"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type HomeTab = { id: string; label: string; badge?: string | null; tone?: "bad" | "warn" | "neutral" };

/**
 * Tabs for the Developer Home. Every panel is rendered on the server and passed in,
 * so switching is instant (no reload). The chosen tab is kept in the address
 * (#speed, #errors …) so a refresh or a shared link opens the same tab.
 */
export function HomeTabs({ tabs, panels, initial }: { tabs: HomeTab[]; panels: Record<string, React.ReactNode>; initial: string }) {
  const [active, setActive] = useState(initial);

  useEffect(() => {
    const fromHash = window.location.hash.replace("#", "");
    if (fromHash && tabs.some((t) => t.id === fromHash)) setActive(fromHash);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pick(id: string) {
    setActive(id);
    try {
      window.history.replaceState(null, "", `#${id}`);
    } catch {
      /* the tab still switches without the address update */
    }
  }

  return (
    <div>
      <div role="tablist" aria-label="Home sections" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {tabs.map((t) => {
          const on = t.id === active;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={on}
              type="button"
              onClick={() => pick(t.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                on
                  ? "border-primary bg-primary text-primary-foreground shadow-soft"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
              )}
            >
              {t.label}
              {t.badge != null && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[11px] font-semibold leading-none tabular-nums",
                    on
                      ? "bg-white/25 text-primary-foreground"
                      : t.tone === "bad"
                        ? "bg-destructive/15 text-destructive"
                        : t.tone === "warn"
                          ? "bg-warning/20 text-warning"
                          : "bg-muted text-muted-foreground",
                  )}
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="mt-5 animate-fade-in" role="tabpanel" key={active}>
        {panels[active]}
      </div>
    </div>
  );
}
