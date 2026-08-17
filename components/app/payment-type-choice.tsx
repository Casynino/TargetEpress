"use client";

import { useState } from "react";
import { CalendarClock, Check, Wallet } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { cn } from "@/lib/utils";

/**
 * How is this one being settled — now, or later?
 *
 * The first version was two flat buttons labelled "Paying now" and "Taking it on
 * credit", which read like a pair of verbs somebody had to parse rather than a
 * question with two answers. This is a choice with money on both sides of it, so
 * it gets the room a choice deserves: two cards, each saying what happens to the
 * cargo and to the money, colour-coded the way the rest of the app codes those
 * facts — settled is success, owed is warning.
 *
 * PAY NOW IS ALWAYS PRESELECTED, and shows a tick. Almost every customer pays
 * before collecting; the common answer must be the one already chosen, and the
 * screen must never open in a state where somebody could submit credit terms they
 * did not mean to pick. Selecting it changes nothing else — the payment form
 * underneath is exactly the form that was always there.
 */
export function PaymentTypeChoice({
  cash,
  credit,
  refused,
}: {
  cash: React.ReactNode;
  credit: React.ReactNode | null;
  /** A refusal already on this bill: `true`, or the reason Finance gave. */
  refused?: string | true | null;
}) {
  const t = useT();
  /* Cash, always. Never derived from the bill's state — a screen that opens on
     "credit" because of something about the invoice is a screen that can take a
     decision nobody made. */
  const [mode, setMode] = useState<"cash" | "credit">("cash");

  const card = (active: boolean, tone: "cash" | "credit") =>
    cn(
      "focus-ring group relative flex flex-1 items-start gap-3 rounded-xl border-2 p-4 text-left transition-all",
      active
        ? tone === "cash"
          ? "border-success bg-success/[0.07] shadow-soft"
          : "border-warning bg-warning/[0.07] shadow-soft"
        : "border-border bg-card hover:border-muted-foreground/40 hover:bg-accent/40"
    );

  const tick = (active: boolean, tone: "cash" | "credit") =>
    cn(
      "absolute right-3 top-3 flex h-5 w-5 items-center justify-center rounded-full transition-opacity",
      active
        ? tone === "cash"
          ? "bg-success text-white opacity-100"
          : "bg-warning text-white opacity-100"
        : "opacity-0"
    );

  return (
    <div className="space-y-4">
      {credit ? (
        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("How is this being settled?")}
          </legend>

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => setMode("cash")}
              aria-pressed={mode === "cash"}
              className={card(mode === "cash", "cash")}
            >
              <span className={tick(mode === "cash", "cash")}>
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <Wallet
                className={cn(
                  "mt-0.5 h-5 w-5 shrink-0",
                  mode === "cash" ? "text-success" : "text-muted-foreground"
                )}
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold">{t("Pay now")}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t("The customer settles the bill and the cargo goes")}
                </span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => setMode("credit")}
              aria-pressed={mode === "credit"}
              className={card(mode === "credit", "credit")}
            >
              <span className={tick(mode === "credit", "credit")}>
                <Check className="h-3 w-3" strokeWidth={3} />
              </span>
              <CalendarClock
                className={cn(
                  "mt-0.5 h-5 w-5 shrink-0",
                  mode === "credit" ? "text-warning" : "text-muted-foreground"
                )}
              />
              <span className="min-w-0">
                <span className="block text-sm font-bold">{t("Pay later")}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  {t("The cargo goes now and the bill falls due on a date")}
                </span>
              </span>
            </button>
          </div>
        </fieldset>
      ) : null}

      {refused ? (
        <p className="rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-semibold">
            {t("Credit has already been refused on this bill")}
          </span>
          {typeof refused === "string" ? ` — “${refused}”` : ""}
        </p>
      ) : null}

      {mode === "cash" ? cash : credit}
    </div>
  );
}
