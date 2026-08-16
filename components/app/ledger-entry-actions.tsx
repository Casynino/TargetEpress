"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Ban, Pencil } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cancelLedgerEntry } from "@/lib/actions/ledger";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Fixing a line in the register.
 *
 * Two doors, because a wrong line is wrong in one of two ways. If the FIGURE
 * or the details are wrong, the document behind it is what needs correcting —
 * editing the cost restates its ledger line for you, so that is where Edit
 * goes rather than duplicating a form here. If the movement should not have
 * happened at all, Cancel posts the opposite line and strikes this one
 * through.
 *
 * The reason is required and ends up in the register itself, because "why is
 * there a cancellation on the 16th" is the question somebody will ask in four
 * months, and the person who can answer is here now.
 */
export function LedgerEntryActions({
  entryId,
  /** Where the figure actually lives, when the line has a document behind it. */
  editHref,
  editLabel,
  cancelled,
  isReversal,
}: {
  entryId: string;
  editHref?: string | null;
  editLabel?: string;
  cancelled?: boolean;
  isReversal?: boolean;
}) {
  const t = useT();
  const [state, action] = useActionState<ActionResult | undefined, FormData>(
    cancelLedgerEntry,
    undefined
  );
  const [open, setOpen] = useState(false);

  if (cancelled) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("This line has already been cancelled.")}
      </p>
    );
  }
  if (isReversal) {
    return (
      <p className="text-xs text-muted-foreground">
        {t(
          "This line is itself a cancellation, so it cannot be cancelled again. Record a fresh movement instead."
        )}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {editHref ? (
          <Link
            href={editHref}
            className="focus-ring inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
          >
            <Pencil className="h-3.5 w-3.5" />
            {editLabel ?? t("Edit the figure")}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
        >
          <Ban className="h-3.5 w-3.5" />
          {t("Cancel this movement")}
        </button>
      </div>

      {open ? (
        <form action={action} className="space-y-2 rounded-lg border bg-muted/30 p-3">
          <input type="hidden" name="entryId" value={entryId} />
          <Label htmlFor={`why-${entryId}`} className="text-xs">
            {t("Why is it being cancelled?")}
          </Label>
          <Input
            id={`why-${entryId}`}
            name="reason"
            required
            placeholder={t("Recorded twice by mistake")}
            className="h-9 text-sm"
          />
          <p className="text-[11px] text-muted-foreground">
            {t(
              "The money goes back to the account today and this line is struck through. Both stay in the register, so the balance can always be explained."
            )}
          </p>
          <FormError state={state} />
          <SubmitButton className="h-8 bg-destructive text-xs text-white">
            {t("Cancel the movement")}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
