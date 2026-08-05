"use client";

import { useActionState } from "react";
import { ClipboardCheck } from "lucide-react";

import { FormError, FormSuccess, SubmitButton } from "@/components/app/form-feedback";
import { confirmBatchPrices } from "@/lib/actions/finance";
import type { ActionResult } from "@/lib/actions/types";

/**
 * The first thing Finance is asked to do on a dispatch.
 *
 * Every consignment was priced automatically when it was checked in, so this
 * page opens with a list of figures nobody has looked at. The job is to read
 * down the list, correct anything that looks wrong, and sign the rest off — so
 * the page says that, once, at the top, and gives it one button.
 *
 * Deliberately not a modal. A modal that must be dismissed before the numbers
 * can be read asks somebody to agree to a list they have not seen.
 */
export function ConfirmPricesBanner({
  batchId,
  drafts,
  totalUsd,
  currency,
}: {
  batchId: string;
  drafts: number;
  /** What the drafts add up to, so the ask has a size. */
  totalUsd: number;
  currency: string;
}) {
  const [state, action] = useActionState<
    ActionResult<{ confirmed: number; skipped: number; blocked: string[] }>,
    FormData
  >(confirmBatchPrices, { ok: true });

  if (drafts === 0) return null;

  const done = state.ok && state.data;

  return (
    <section className="mb-6 rounded-xl border border-signal/40 bg-signal/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-display font-semibold">
            <ClipboardCheck className="h-4 w-4 text-signal" />
            {drafts} price{drafts === 1 ? "" : "s"} waiting for you
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The system priced every consignment from the rate book when it was
            checked in — {currency} {totalUsd.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}{" "}
            in total. Read down the list below, open anything that looks wrong
            and correct it, then confirm the rest in one go. Confirming
            re-works each price out at today&apos;s storage days and exchange
            rate, and turns it into an invoice you can send.
          </p>
        </div>

        <form action={action} className="shrink-0 space-y-2">
          <input type="hidden" name="batchId" value={batchId} />
          <SubmitButton variant="signal" pendingLabel="Confirming…">
            Confirm all {drafts} prices
          </SubmitButton>
        </form>
      </div>

      <div className="mt-3 space-y-1">
        <FormError state={state} />
        <FormSuccess
          message={
            done
              ? `${state.data!.confirmed} invoice(s) confirmed and ready to send.` +
                (state.data!.blocked.length
                  ? ` ${state.data!.blocked.length} could not be priced: ${state.data!.blocked.slice(0, 3).join(", ")}${state.data!.blocked.length > 3 ? " and others" : ""}.`
                  : "")
              : null
          }
        />
      </div>
    </section>
  );
}
