"use client";

import { useActionState, useState } from "react";
import { Ban, RotateCcw } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { voidInvoice } from "@/lib/actions/finance";

/**
 * Cancelling a bill that should never have been raised.
 *
 * Two presses, not one: the control opens, says plainly what is about to
 * happen, and only then takes the reason. A bill is the thing a customer is
 * told they owe, and a single mis-click should not be able to remove one.
 *
 * Rendered only where the server would accept it — a draft for the desk that
 * raises bills, a confirmed one for the owner alone. The action re-checks
 * both, because a control that is merely unrendered is not a permission.
 */
export function InvoiceVoid({
  invoiceId,
  invoiceNumber,
  confirmed,
}: {
  invoiceId: string;
  invoiceNumber: string;
  /** Already signed off, so the customer has been quoted this figure. */
  confirmed: boolean;
}) {
  const t = useT();
  const [state, action] = useActionState(voidInvoice, undefined);
  const [open, setOpen] = useState(false);

  if (state?.ok) {
    return (
      <p className="rounded-lg border border-success/30 bg-success/5 p-2.5 text-xs text-success">
        {invoiceNumber} {t("is cancelled. The cargo will be priced again when Dar checks it in.")}
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex h-11 items-center gap-1.5 rounded-md border px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-destructive/40 hover:text-destructive md:h-8"
      >
        <Ban className="h-3.5 w-3.5" />
        {t("Cancel this bill")}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/[0.04] p-3"
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <p className="text-xs font-medium">
        {t("Cancel")} {invoiceNumber}?
      </p>
      {/* What it does, before it does it. */}
      <p className="text-[11px] text-muted-foreground">
        {confirmed
          ? t(
              "The bill is removed and the cargo goes back to having no price. It will be priced again from the rate book when Dar checks it in. Who cancelled it, and why, stays on the audit log."
            )
          : t(
              "This price was never signed off, so nobody has been asked for it. The cargo goes back to having no bill and will be priced again when Dar checks it in."
            )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="reason"
          required
          placeholder={t("Why is this bill being cancelled?")}
          className="h-11 min-w-[220px] flex-1 text-xs md:h-8"
        />
        <SubmitButton
          size="sm"
          className="h-11 bg-destructive px-3 text-xs text-white md:h-8"
          pendingLabel={t("Cancelling…")}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          {t("Cancel the bill")}
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="focus-ring rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {t("Keep it")}
        </button>
      </div>
      <FormError state={state} />
    </form>
  );
}
