"use client";

import { useActionState } from "react";
import { Scale } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { repriceOnCurrentWeight } from "@/lib/actions/reprice";
import type { ActionResult } from "@/lib/actions/types";

/**
 * THE BILL IS STANDING ON A WEIGHT THIS CARGO NO LONGER IS.
 *
 * Said where the money is read, with both figures, because the two numbers
 * are on the same screen and nobody spots that they disagree: 94 kg on the
 * cargo, a bill worked out on 33.5. One press puts it right, through exactly
 * the code a corrected weight runs — the agreed rate stands, only the kilos
 * move, and a bill with money on it is refused with a reason.
 */
export function RepriceOnWeight({
  shipmentId,
  billedKg,
  actualKg,
  currency,
  total,
}: {
  shipmentId: string;
  /** What the freight on the bill was worked out on. */
  billedKg: number;
  /** What the cargo weighs now. */
  actualKg: number;
  currency: string;
  /** What the bill says today, so the desk reads the before and the after. */
  total: number;
}) {
  const t = useT();
  const [state, action] = useActionState<
    ActionResult<{ before: number; after: number; currency: string }> | undefined,
    FormData
  >(repriceOnCurrentWeight, undefined);

  if (state?.ok && state.data) {
    return (
      <p className="rounded-lg border border-success/40 bg-success/5 px-3 py-2 text-xs text-success">
        {t("Re-priced on")} {actualKg} kg — {state.data.currency}{" "}
        {state.data.before.toFixed(2)} → {state.data.currency}{" "}
        <span className="font-semibold">{state.data.after.toFixed(2)}</span>
      </p>
    );
  }

  return (
    <form
      action={action}
      className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5"
    >
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
        <Scale className="h-3.5 w-3.5 shrink-0" />
        {t("This price is on the old weight")}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        {t("The bill was worked out on")}{" "}
        <span className="font-medium text-foreground">{billedKg} kg</span>
        {t(", and this cargo weighs")}{" "}
        <span className="font-medium text-foreground">{actualKg} kg</span>.{" "}
        {t("It is billed")} {currency} {total.toFixed(2)}{" "}
        {t("until it is worked out again.")}
      </p>
      <FormError state={state} />
      <div className="mt-2">
        <SubmitButton size="sm" variant="brand" pendingLabel={t("Working it out…")}>
          {t("Re-price on")} {actualKg} kg
        </SubmitButton>
      </div>
    </form>
  );
}
