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
  automatic = false,
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
  /**
   * The system worked this out from a corrected weight — nobody typed it.
   *
   * It changes what the panel has to say. A price somebody agreed is news
   * about a decision; a price the rate book re-did because the warehouse put
   * the box on a scale is news about the cargo, and the desk reading it is
   * usually about to take money on the new figure.
   */
  automatic?: boolean;
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

  /* A rate worth printing: both sides known, and either the figure or the
     unit really moved — 40.00 a piece and 40.00 a kilo are different prices. */
  const showRates =
    rateBefore !== null &&
    rateAfter !== null &&
    (Math.abs(rateAfter - rateBefore) > 0.0005 ||
      (perItemBefore ?? perItem) !== perItem);

  return (
    /*
      ONE SMALL PANEL, THE SIZE OF THE FACT IT CARRIES.

      This was a full-width card: an icon block, a heading, a sentence, a
      boxed table of four figures, a boxed reason, a by-line and a row of
      buttons — eight blocks for "the price moved, here is what it was". Beside
      the old-weight notice two inches above it, which says the same kind of
      thing in three lines, it read as a different and more serious species of
      message. The owner's instruction was simply to make them the same, and
      the smaller one was right.

      Everything the old panel said is still said; it is said in sentences
      rather than in furniture.
    */
    <div
      className={
        "no-print rounded-lg border px-3 py-2.5 " +
        (netZero
          ? "border-border bg-muted/40"
          : "border-warning/40 bg-warning/10")
      }
    >
      <p
        className={
          "flex items-center gap-1.5 text-xs font-semibold " +
          (netZero ? "text-foreground" : "text-warning")
        }
      >
        <Scale className="h-3.5 w-3.5 shrink-0" />
        {netZero
          ? t("This price was changed and put back")
          : automatic
            ? t("KG changed — price affected")
            : t("This price was changed")}
      </p>

      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {/* The figures first, in the order they happened, bold where the eye
            should land. A rate beside them only where one moved — it is what
            makes a wrong figure obvious. */}
        <span className="font-mono tabular-nums">{money(totalBefore)}</span>
        {" → "}
        <span className="font-mono font-semibold tabular-nums text-foreground">
          {money(totalAfter)}
        </span>
        {Math.abs(difference) > 0.005 ? (
          <span
            className={
              difference < 0
                ? " font-medium text-warning"
                : " font-medium text-success"
            }
          >
            {" "}
            ({difference < 0 ? "−" : "+"}
            {money(difference)})
          </span>
        ) : null}
        {showRates ? (
          <>
            {", "}
            <span className="font-mono tabular-nums">
              {currency} {rateBefore!.toFixed(2)}
            </span>
            {" → "}
            <span className="font-mono font-medium tabular-nums text-foreground">
              {currency} {rateAfter!.toFixed(2)}{" "}
              {perItem ? t("per item") : t("per kg")}
            </span>
          </>
        ) : null}
        {". "}
        {/* A sentence, not a heap of fragments: "Changed by Hawa" where it
            happened once, and the count in front where a desk corrected
            itself on the way. */}
        {steps > 1
          ? `${t("Changed")} ${steps} ${t("times")}, ${t("by")} ${changedBy}`
          : `${t("Changed by")} ${changedBy}`}
        {" · "}
        {changedAt}. {reason ? `“${reason}” ` : ""}
        {netZero
          ? t("The bill is back where it started.")
          : automatic
            ? t("The kilos changed, so the price was worked out again. Record the new figure, or undo to put the old one back.")
            : t("Finance has not checked it yet.")}
      </p>

      <FormError state={state} />
      <FormError state={undo} />

      {canReview ? (
        mode === null ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <form action={action}>
              <input type="hidden" name="changeId" value={changeId} />
              <input type="hidden" name="decision" value="CONFIRM" />
              <SubmitButton
                size="sm"
                variant="brand"
                pendingLabel={t("Saving…")}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                {t("Checked — this price is fine")}
              </SubmitButton>
            </form>
            <button
              type="button"
              onClick={() => setMode("revert")}
              className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
            >
              <Undo2 className="h-3.5 w-3.5" />
              {t("Put it back")}
            </button>
          </div>
        ) : (
          <form action={action} className="mt-2 space-y-2">
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
           puts the bill in exactly the state it was in — not a second change
           typed from memory. What that state IS goes on the button, because a
           run of changes goes back to where the run started, rate and all. */
        <form action={undoAction} className="mt-2">
          <input type="hidden" name="changeId" value={changeId} />
          <SubmitButton
            size="sm"
            variant="outline"
            pendingLabel={t("Putting it back…")}
          >
            <Undo2 className="mr-1.5 h-3.5 w-3.5" />
            {`${t("Undo — back to")} ${money(totalBefore)}${
              showRates
                ? ` ${t("at")} ${currency} ${rateBefore!.toFixed(2)}`
                : ""
            }`}
          </SubmitButton>
        </form>
      ) : (
        <p className="mt-2 text-[11px] text-muted-foreground">
          {t("Finance will check this change.")}
        </p>
      )}
    </div>
  );
}
