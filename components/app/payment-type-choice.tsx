"use client";

import { useState } from "react";
import { Banknote, CalendarClock } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { cn } from "@/lib/utils";

/**
 * Cash, or credit — the first question at the counter.
 *
 * Two buttons above one form. Cash is selected, always, because that is what
 * almost every customer does and the common path must not grow a step: choosing
 * it changes nothing about the screen that was there before.
 *
 * Credit swaps the form for the request. It is not a second way to take money —
 * nothing is settled and no figure moves — it asks Finance for permission to let
 * the cargo go unpaid, which is why the two are presented as a choice rather than
 * as a checkbox on the payment form. A checkbox would have implied you were still
 * recording a payment.
 *
 * The button is absent, rather than disabled, for a desk that may not ask for
 * credit. A disabled control invites somebody to keep pressing it.
 */
export function PaymentTypeChoice({
  cash,
  credit,
  /** A refusal on this bill: `true`, or the reason Finance gave. */
  refused,
}: {
  cash: React.ReactNode;
  credit: React.ReactNode | null;
  refused?: string | true | null;
}) {
  const t = useT();
  const [mode, setMode] = useState<"cash" | "credit">("cash");

  const tab = (active: boolean) =>
    cn(
      "focus-ring inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border px-4 text-sm font-semibold transition-colors",
      active
        ? "border-brand bg-brand text-white"
        : "hover:bg-accent hover:text-brand"
    );

  return (
    <div className="space-y-4">
      {credit ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode("cash")}
            aria-pressed={mode === "cash"}
            className={tab(mode === "cash")}
          >
            <Banknote className="h-4 w-4" />
            {t("Paying now")}
          </button>
          <button
            type="button"
            onClick={() => setMode("credit")}
            aria-pressed={mode === "credit"}
            className={tab(mode === "credit")}
          >
            <CalendarClock className="h-4 w-4" />
            {t("Taking it on credit")}
          </button>
        </div>
      ) : null}

      {/* A refusal already on the record, stated once here rather than left for
          somebody to rediscover by asking again and being told no twice. */}
      {refused ? (
        <p className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold">
            {t("Finance has already refused credit on this bill")}
          </span>
          {typeof refused === "string" ? ` — “${refused}”` : ""}
        </p>
      ) : null}

      {mode === "cash" ? cash : credit}
    </div>
  );
}
