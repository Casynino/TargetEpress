"use client";

import { useActionState, useState } from "react";
import { Scale, Check, Undo2 } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import {
  reviewPriceChange,
  undoPriceChange,
} from "@/lib/actions/price-changes";
import type { ActionResult } from "@/lib/actions/types";

/**
 * THIS PRICE WAS CHANGED, AND HERE IS WHAT IT WAS.
 *
 * NOT AN APPROVAL. The figure printed below this panel is already the new one,
 * the customer may already have been sent it, and nothing is being held. The
 * owner's rule is not that Finance decides the price — it is that a price
 * cannot move without Finance knowing it moved, and being able to put it back
 * in one press.
 *
 * So it is loud for a different reason than a pending request would be: not
 * "do not quote this", but "this is not what the bill said this morning".
 * Everyone sees it, including the desk that made the change — a change you
 * cannot see you made is one you cannot correct.
 */
export function PriceChangeNotice({
  changeId,
  currency,
  totalBefore,
  totalAfter,
  rateBefore = null,
  rateAfter = null,
  perItem = false,
  perItemBefore,
  steps = 1,
  reason,
  changedBy,
  changedAt,
  canReview,
  canUndo = false,
}: {
  changeId: string;
  currency: string;
  /** Where the bill stood before this desk started — not before its last step. */
  totalBefore: number;
  totalAfter: number;
  /**
   * THE RATE, WHICH IS WHERE THE MISTAKE IS ACTUALLY LEGIBLE.
   *
   * A bill going from 8,893.75 to 16,364.50 says nothing to a reader; the same
   * change said as 12.50/kg to 23.00/kg is obviously wrong at a glance on a
   * corridor whose book rate is 12.50. Null where the freight was typed as a
   * lump with no rate behind it, which is a real case and not an error.
   */
  rateBefore?: number | null;
  rateAfter?: number | null;
  perItem?: boolean;
  /** The unit the starting rate was in, where the change moved the unit too.
      Defaults to `perItem`. */
  perItemBefore?: boolean;
  /** How many edits this run is. More than one means a desk corrected itself. */
  steps?: number;
  reason: string | null;
  changedBy: string;
  changedAt: string;
  /** Holds invoice.priceConfirm — Finance, the manager, the owner. */
  canReview: boolean;
  /** Made this change, and nobody has looked at it yet. */
  canUndo?: boolean;
}) {
  const t = useT();
  const [mode, setMode] = useState<null | "revert">(null);
  const [state, action] = useActionState<
    ActionResult<{ reverted: boolean }> | undefined,
    FormData
  >(reviewPriceChange, undefined);
  const [undo, undoAction] = useActionState<
    ActionResult<{ undone: boolean }> | undefined,
    FormData
  >(undoPriceChange, undefined);

  const difference = Math.round((totalAfter - totalBefore) * 100) / 100;
  const money = (n: number) => `${currency} ${Math.abs(n).toFixed(2)}`;
  /*
    A RUN THAT ENDS WHERE IT STARTED.

    A desk mistypes a rate, sees the bill jump, and types it back. The customer
    owes exactly what they always owed — but three rows were written and the
    panel shouted at Finance about a change that, in the end, was not one.
    Still worth their glance: a live bill moved twice. Not worth the alarm.
  */
  const netZero = Math.abs(difference) <= 0.005;

  return (
    <div
      className={
        "no-print mb-6 rounded-xl border p-4 " +
        (netZero ? "border-border bg-muted/40" : "border-warning/40 bg-warning/5")
      }
    >
      <div className="flex items-start gap-3">
        <span
          className={
            "mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg " +
            (netZero
              ? "bg-muted text-muted-foreground"
              : "bg-warning/15 text-warning")
          }
        >
          <Scale className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {netZero
              ? t("This price was changed and put back")
              : t("This price was changed")}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {netZero
              ? t("The bill is back at the figure it started on, so the customer owes what they always owed. Finance has not checked it yet.")
              : t("The new figure is already on the bill and the customer can be sent it. Finance has not checked it yet.")}
          </p>

          <p className="mt-3 font-mono text-sm tabular-nums">
            <span
              className={
                netZero ? "text-muted-foreground" : "text-muted-foreground line-through"
              }
            >
              {money(totalBefore)}
            </span>
            {" → "}
            <span className="font-semibold text-foreground">
              {money(totalAfter)}
            </span>
            {Math.abs(difference) > 0.005 ? (
              <span
                className={
                  difference < 0 ? " text-warning" : " text-success"
                }
              >
                {" "}
                ({difference < 0 ? "−" : "+"}
                {money(difference)})
              </span>
            ) : null}
          </p>

          {/* The rate is what makes a wrong figure obvious. 12.50 → 23.00 on a
              corridor billed at 12.50 reads as a mistake; the totals it
              produces do not. */}
          {/* A unit switched is a change even where the figure is the same
              number: 40.00 a piece and 40.00 a kilo are different prices. Each
              side carries its own unit when they differ. */}
          {rateBefore !== null &&
          rateAfter !== null &&
          (Math.abs(rateAfter - rateBefore) > 0.0005 ||
            (perItemBefore ?? perItem) !== perItem) ? (
            <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
              <span className="line-through">
                {currency} {rateBefore.toFixed(2)}
                {(perItemBefore ?? perItem) !== perItem
                  ? ` ${(perItemBefore ?? perItem) ? t("per item") : t("per kg")}`
                  : ""}
              </span>
              {" → "}
              <span className="font-semibold text-foreground">
                {currency} {rateAfter.toFixed(2)}
              </span>{" "}
              {perItem ? t("per item") : t("per kg")}
            </p>
          ) : null}

          {/* Said plainly, because "put it back" goes to the start of the run
              and a reader seeing one arrow would assume it goes back one step. */}
          {steps > 1 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {t("Changed")} {steps}{" "}
              {netZero
                ? t("times, ending on the original figure.")
                : t("times. Putting it back goes to where the bill started.")}
            </p>
          ) : null}

          {reason ? (
            <p className="mt-2 rounded-lg border bg-card px-3 py-2 text-sm">
              <span className="text-muted-foreground">{t("Reason")}: </span>
              {reason}
            </p>
          ) : null}
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t("Changed by")} {changedBy} · {changedAt}
          </p>

          <FormError state={state} />
          <FormError state={undo} />

          {canReview ? (
            mode === null ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <form action={action}>
                  <input type="hidden" name="changeId" value={changeId} />
                  <input type="hidden" name="decision" value="CONFIRM" />
                  <SubmitButton size="sm" variant="brand" pendingLabel={t("Saving…")}>
                    <Check className="mr-1.5 h-3.5 w-3.5" />
                    {t("Checked — this price is fine")}
                  </SubmitButton>
                </form>
                <button
                  type="button"
                  onClick={() => setMode("revert")}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  {t("Put it back")}
                </button>
              </div>
            ) : (
              <form action={action} className="mt-3 space-y-2">
                <input type="hidden" name="changeId" value={changeId} />
                <input type="hidden" name="decision" value="REVERT" />
                <Input
                  name="reviewNote"
                  placeholder={t("Why it goes back — the desk reads this")}
                  className="h-8 text-xs"
                />
                <div className="flex items-center gap-2">
                  <SubmitButton
                    size="sm"
                    variant="destructive"
                    pendingLabel={t("Putting it back…")}
                  >
                    {`${t("Put it back to")} ${money(totalBefore)}`}
                  </SubmitButton>
                  <button
                    type="button"
                    onClick={() => setMode(null)}
                    className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {t("Cancel")}
                  </button>
                </div>
              </form>
            )
          ) : canUndo ? (
            /* The desk that made it, before anybody has looked. Taking it back
               puts the bill in exactly the state it was in — not a second
               change typed from memory. */
            <form action={undoAction} className="mt-3">
              <input type="hidden" name="changeId" value={changeId} />
              <SubmitButton
                size="sm"
                variant="outline"
                pendingLabel={t("Putting it back…")}
              >
                <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                {`${t("Undo this change")} — ${t("back to")} ${money(totalBefore)}`}
              </SubmitButton>
            </form>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("Finance will check this change.")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
