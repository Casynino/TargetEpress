"use client";

import { useActionState, useState } from "react";
import { BadgeCheck, Ban } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { approveCredit, rejectCredit } from "@/lib/actions/credit";
import { CREDIT_TERMS } from "@/lib/credit";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Grant the credit, or refuse it and say why.
 *
 * Approving is one press. The terms were already chosen by whoever asked, so
 * Finance is answering a specific question rather than filling in a form — the
 * select is there for the case where it wants to give shorter terms than it was
 * asked for, and it defaults to what was requested.
 *
 * Refusing opens a reason field and will not proceed without one. A no that
 * nobody explained gets asked again the same afternoon by the same desk, and the
 * customer hears two different answers from one company.
 *
 * The over-limit warning is a warning, not a block. The business grants credit,
 * not the software: a decision made with both eyes open is still the owner's to
 * make, and pretending the system refused it is how a real decision stops being
 * recorded anywhere.
 */
export function CreditDecision({
  invoiceId,
  invoiceNumber,
  termDays,
  amountUsd,
  warning,
}: {
  invoiceId: string;
  invoiceNumber: string;
  termDays: number | null;
  amountUsd: number;
  /** "over" past the limit, "near" close to it, "none" no facility at all. */
  warning: "over" | "near" | "none" | null;
}) {
  const t = useT();
  const [approveState, approve] = useActionState<ActionResult | undefined, FormData>(
    approveCredit,
    undefined
  );
  const [rejectState, reject] = useActionState<ActionResult | undefined, FormData>(
    rejectCredit,
    undefined
  );
  const [refusing, setRefusing] = useState(false);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <form action={approve} className="flex items-center gap-1.5">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <select
            name="termDays"
            defaultValue={String(termDays ?? 14)}
            aria-label={t("Payment terms")}
            className="focus-ring h-11 md:h-7 rounded-md border bg-card px-1.5 text-[11px]"
          >
            {CREDIT_TERMS.map((d) => (
              <option key={d} value={d}>
                {d} {t("days")}
              </option>
            ))}
          </select>
          <SubmitButton size="sm" className="h-11 md:h-7 px-2.5 text-[11px]">
            <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />
            {warning === "over"
              ? t("Approve anyway")
              : t("Approve credit")}
          </SubmitButton>
        </form>

        <button
          type="button"
          onClick={() => setRefusing((v) => !v)}
          aria-expanded={refusing}
          className="focus-ring inline-flex h-11 md:h-7 items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 text-[11px] font-medium text-destructive hover:bg-destructive/10"
        >
          <Ban className="h-3.5 w-3.5" />
          {t("Refuse")}
        </button>

        {warning === "over" ? (
          <span className="text-[11px] font-semibold text-destructive">
            {t("This goes past their limit — approving is your call, on the record.")}
          </span>
        ) : warning === "none" ? (
          <span className="text-[11px] text-warning">
            {t("No credit limit is set for this customer.")}
          </span>
        ) : null}
      </div>

      <FormError state={approveState} />

      {refusing ? (
        <form action={reject} className="flex flex-wrap items-center gap-1.5">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <Input
            name="note"
            required
            aria-label={`${t("Why is credit refused on")} ${invoiceNumber}`}
            placeholder={t("Why is the credit refused?")}
            className="h-11 md:h-7 min-w-[220px] flex-1 text-[11px]"
          />
          <SubmitButton
            size="sm"
            className="h-11 md:h-7 bg-destructive px-2.5 text-[11px] text-white"
          >
            {t("Refuse it")}
          </SubmitButton>
        </form>
      ) : null}

      <FormError state={rejectState} />
    </div>
  );
}
