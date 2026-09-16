"use client";

import { useActionState, useState } from "react";
import { Scale, Check } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { applyPooledMinimum } from "@/lib/actions/pooling";
import type { ActionResult } from "@/lib/actions/types";

/**
 * CHARGE THE ROUTE'S MINIMUM ONCE, AFTER SAYING EXACTLY WHAT THAT DOES.
 *
 * This moves what a live customer owes across two or more bills at once, and
 * the owner asked to be told what happens before anybody presses it. So the
 * press is in two parts: the first shows every bill and what it becomes, the
 * second does it.
 *
 * The figures shown are the ones the action will write, derived by the same
 * rule on the server — the panel agrees to the change itself rather than to a
 * description of it.
 */
export function ApplyPooledMinimum({
  invoiceId,
  currency,
  billed,
  corrected,
  lines,
}: {
  invoiceId: string;
  currency: string;
  /** What the bills ask for today. */
  billed: number;
  /** What one minimum comes to. */
  corrected: number;
  /** Every bill in the pool and what it becomes. */
  lines: { trackingNumber: string; from: number; to: number }[];
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [state, action] = useActionState<
    ActionResult<{ from: number; to: number }> | undefined,
    FormData
  >(applyPooledMinimum, undefined);

  const money = (n: number) => `${currency} ${n.toFixed(2)}`;

  if (state?.ok && state.data) {
    return (
      <p className="mt-3 flex items-start gap-2 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
        <Check className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {t("Corrected.")} {t("These bills now ask for")}{" "}
          <span className="font-mono font-semibold tabular-nums">
            {money(state.data.to)}
          </span>
          .
        </span>
      </p>
    );
  }

  if (!asking) {
    return (
      <div className="mt-3">
        <FormError state={state} />
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="focus-ring inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
        >
          <Scale className="h-3.5 w-3.5" />
          {`${t("Correct it")} — ${money(corrected)}`}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-3 rounded-lg border bg-card p-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <p className="text-sm font-semibold">
        {t("This is what will change")}
      </p>

      <table className="mt-2 w-full text-[13px]">
        <tbody>
          {lines.map((l) => (
            <tr key={l.trackingNumber} className="border-b last:border-0">
              <td className="py-1.5 font-mono">{l.trackingNumber}</td>
              <td className="py-1.5 text-right font-mono tabular-nums text-muted-foreground line-through">
                {money(l.from)}
              </td>
              <td className="py-1.5 pl-3 text-right font-mono font-semibold tabular-nums">
                {money(l.to)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="mt-2 text-xs text-muted-foreground">
        {t("The customer goes from")}{" "}
        <span className="font-mono tabular-nums">{money(billed)}</span>{" "}
        {t("to")}{" "}
        <span className="font-mono font-semibold tabular-nums text-foreground">
          {money(corrected)}
        </span>
        .
      </p>
      {/* What it does NOT touch, because that is the question somebody about to
          press it is actually asking. */}
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
        {t(
          "Nothing else moves: the weights, the tracking numbers, the flight and any pickup notes stay exactly as they are, and no cargo record is deleted. A bill that goes to nothing is marked settled so its cargo can still be released. It is recorded against your name."
        )}
      </p>
      {/* Reversible, and said so — otherwise the honest answer to "what if I am
          wrong" is a shrug. */}
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
        {t(
          "There is no one-press undo. To put it back, open each bill and set its Air freight to what it was."
        )}
      </p>

      <FormError state={state} />
      <div className="mt-3 flex items-center gap-2">
        <SubmitButton size="sm" variant="brand" pendingLabel={t("Correcting…")}>
          {`${t("Yes, correct it")} — ${money(corrected)}`}
        </SubmitButton>
        <button
          type="button"
          onClick={() => setAsking(false)}
          className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
