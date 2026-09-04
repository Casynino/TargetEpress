"use client";

import { Paperclip } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Asking for the customer's proof, in one place and hard to miss.
 *
 * It was a grey label with a grey sentence under it, sitting between two other
 * grey fields — so the thing that settles an argument a year from now looked
 * exactly like the thing that does not. The owner asked for it to carry
 * colour, and the amber says the same thing the credit panel's amber says:
 * read this one, it is not a formality.
 *
 * Optional, and still optional. The colour is not there to nag; it is there so
 * that a desk with a customer waiting SEES that a screenshot is wanted, rather
 * than scrolling past a label the same weight as everything else.
 *
 * One component, because the wording drifted across four forms before this and
 * the desk was told a different thing on each of them.
 */
export function PaymentProofField({
  id = "proof",
  name = "proof",
  compact = false,
}: {
  id?: string;
  name?: string;
  /**
   * For the counter dialog, where this sits in a row beside the submit button
   * and a full panel would push the button off the line. Same colour, same
   * words, less of them.
   */
  compact?: boolean;
}) {
  const t = useT();

  if (compact) {
    return (
      <label className="flex min-w-0 flex-col gap-1 rounded-lg border border-warning/40 bg-warning/5 px-2.5 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-warning">
          <Paperclip className="h-3.5 w-3.5 shrink-0" />
          {t("Payment proof — the slip or the screenshot")}
        </span>
        <Input
          id={id}
          name={name}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          multiple
          className="w-56 bg-card file:mr-3 file:rounded file:border-0 file:bg-warning/15 file:px-2 file:py-1 file:text-xs file:font-medium file:text-warning"
        />
      </label>
    );
  }

  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 p-3.5">
      <Label
        htmlFor={id}
        className="flex items-center gap-1.5 text-sm font-semibold text-warning"
      >
        <Paperclip className="h-4 w-4 shrink-0" />
        {t("Payment proof — the slip or the screenshot")}
      </Label>
      <p className="mt-1 text-xs text-muted-foreground">
        {t(
          "Not compulsory, but it is what settles an argument months from now. Without it Finance is agreeing to this on somebody's word."
        )}
      </p>
      <Input
        id={id}
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        multiple
        className="mt-2.5 file:mr-3 file:rounded file:border-0 file:bg-warning/15 file:px-2 file:py-1 file:text-xs file:font-medium file:text-warning"
      />
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {t(
          "The M-Pesa screenshot, bank slip or transfer confirmation. This is what settles an argument months later — a typed number is only a claim that it happened."
        )}
      </p>
    </div>
  );
}
