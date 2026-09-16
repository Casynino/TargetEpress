"use client";

import { useActionState } from "react";
import { Scale } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { applyPooledMinimum } from "@/lib/actions/pooling";
import type { ActionResult } from "@/lib/actions/types";

/**
 * One press that charges the route's minimum once across a customer's cargo.
 *
 * Offered only where the arithmetic above it has already shown the reader what
 * the bills come to and what they should come to — the button does not decide
 * anything the page has not already stated, and pressing it writes the figure
 * poolShareFor gives, which is the one check-in would have written.
 */
export function ApplyPooledMinimum({
  invoiceId,
  correctedLabel,
}: {
  invoiceId: string;
  /** What the bills will come to, so the button names the outcome. */
  correctedLabel: string;
}) {
  const t = useT();
  const [state, action] = useActionState<
    ActionResult<{ from: number; to: number }> | undefined,
    FormData
  >(applyPooledMinimum, undefined);

  if (state?.ok && state.data) {
    return (
      <p className="mt-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
        {t("Corrected.")} {t("These bills now ask for")}{" "}
        <span className="font-mono font-semibold tabular-nums">
          {state.data.to.toFixed(2)}
        </span>
        .
      </p>
    );
  }

  return (
    <form action={action} className="mt-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <FormError state={state} />
      <SubmitButton size="sm" variant="brand" pendingLabel={t("Correcting…")}>
        <Scale className="mr-1.5 h-3.5 w-3.5" />
        {`${t("Correct it")} — ${correctedLabel}`}
      </SubmitButton>
    </form>
  );
}
