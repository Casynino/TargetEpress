"use client";

import { useState, useTransition } from "react";
import { BadgeCheck } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { chargeStorageFee } from "@/lib/actions/storage";

/**
 * PUTTING THE ACCRUED STORAGE ONTO THE BILL, WHERE THE MONEY IS TAKEN.
 *
 * Storage on an invoice is written when the price is generated or confirmed
 * and then stands still, while the clock keeps running. So a consignment that
 * has sat twelve days can carry a bill that says nothing about storage — and
 * the desk collects the freight, hands over the cargo, and the late days are
 * never charged.
 *
 * The two figures are deliberately not folded together. What is on the bill is
 * inside its total and is what a payment settles; what has merely accrued is
 * not, and recordPayment refuses an allocation larger than the bill still owes.
 * A screen that showed one number would promise a figure the payment would then
 * be refused for. So this says what is missing and puts it on in one press —
 * after which the total, the shilling figure and the payment all agree.
 *
 * No amount is typed: it is the policy applied to two dates.
 */
export function AddStorage({
  invoiceId,
  amount,
  currency,
  rate,
  across = 1,
}: {
  /** One id, or the comma-separated set ticked on a payment screen. */
  invoiceId: string;
  /** What has accrued beyond what is already on the bill. */
  amount: number;
  currency: string;
  /** The bill's frozen rate, so it reads in the money the customer pays. */
  rate?: number | null;
  /** How many consignments this covers. Each keeps its own clock. */
  across?: number;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!(amount > 0.005)) return null;

  const local =
    typeof rate === "number" && rate > 0 && currency !== "TZS"
      ? `TSh ${Math.round(amount * rate).toLocaleString("en-US")}`
      : null;

  /*
    NO <form> HERE, AND NO DIALOG.

    The trigger sits inside the payment form, and a <form> inside a <form> is
    invalid HTML — the browser drops the inner one and the press does nothing,
    which is exactly what it did. The discount and the waiver escape by being
    portalled, because they have fields to fill in. This has none: the amount
    is the policy applied to two dates and the only answer is yes. So it calls
    the action itself and stays a plain button.
  */
  const add = () => {
    setError(null);
    start(async () => {
      const data = new FormData();
      data.set("invoiceId", invoiceId);
      const result = await chargeStorageFee(undefined, data);
      if (!result.ok) setError(result.error ?? t("That did not work."));
    });
  };

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={add}
        disabled={pending}
        className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--amber,#a86a08)]/50 px-2.5 text-[11px] font-semibold text-[var(--amber,#a86a08)] disabled:opacity-60"
      >
        <BadgeCheck className="h-3.5 w-3.5" />
        {pending ? t("Adding…") : t("Add storage")} ·{" "}
        {local ?? `${currency} ${amount.toFixed(2)}`}
        {across > 1 ? ` · ${across}` : ""}
      </button>
      {error ? (
        <span className="text-[11px] text-destructive">{error}</span>
      ) : null}
    </span>
  );
}
