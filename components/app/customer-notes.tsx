"use client";

import { useActionState } from "react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Textarea } from "@/components/ui/textarea";
import { saveCustomerNotes } from "@/lib/actions/support";

/**
 * Free-text notes on a customer.
 *
 * The place for "always collects on a Saturday", "brother picks up on his
 * behalf", "disputes storage charges" — the things that make the next
 * conversation go well and that nobody thinks to put in a structured field.
 */
export function CustomerNotesForm({
  customerId,
  notes,
  canEdit,
}: {
  customerId: string;
  notes: string | null;
  canEdit: boolean;
}) {
  const [state, action] = useActionState(saveCustomerNotes, undefined);
  const t = useT();

  if (!canEdit) {
    return (
      <p className="whitespace-pre-wrap text-sm text-muted-foreground">
        {notes || t("No notes on this customer.")}
      </p>
    );
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="customerId" value={customerId} />
      <FormError state={state} />
      {state?.ok ? (
        <p className="rounded-md border border-success/30 bg-success/5 p-2 text-xs text-success">
          {t("Saved.")}
        </p>
      ) : null}
      <Textarea
        name="notes"
        rows={5}
        defaultValue={notes ?? ""}
        placeholder={t("Anything the next person should know before they call.")}
      />
      <SubmitButton pendingLabel={t("Saving…")} variant="secondary" size="sm">
        {t("Save notes")}
      </SubmitButton>
    </form>
  );
}
