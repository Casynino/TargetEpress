"use client";

import { useRef, useState } from "react";
import { Paperclip } from "lucide-react";

import { useT } from "@/components/app/locale-provider";

/**
 * Asking for the customer's proof, in one place and hard to miss.
 *
 * The amber says the same thing the credit panel's amber says: read this one,
 * it is not a formality. Optional, and still optional — the colour is not
 * there to nag, it is there so a desk with a customer waiting SEES that a
 * screenshot is wanted rather than scrolling past a label the same weight as
 * everything else.
 *
 * THE NATIVE CONTROL IS NOT USED FOR THE VISIBLE PART.
 *
 * A file input's "Choose files" button lives in the browser's own shadow tree,
 * and Chrome lays it out by its own rules: it sat hard against the top of the
 * box, and setting flex alignment on the input did not move it — the computed
 * style said centred while the pixels said otherwise. So the input is still
 * the thing that carries the file and submits with the form, and everything
 * visible is ours: a button and a filename in an ordinary flex row, which
 * centres because a div does what it is told.
 *
 * It also tells the desk WHAT they attached. The native control says "No file
 * chosen" and then a truncated name; this says the name, or how many.
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
   * and a full panel would push the button off the line.
   */
  compact?: boolean;
}) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<string[]>([]);

  const picker = (
    <>
      <input
        ref={ref}
        id={id}
        name={name}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf"
        multiple
        className="sr-only"
        onChange={(event) =>
          setChosen(Array.from(event.target.files ?? []).map((f) => f.name))
        }
      />
      {/* No box of its own. The row around this already has a border and a
          ground; a second one inside it made a box-in-a-box for two controls
          that belong on one line. */}
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <button
          type="button"
          onClick={() => ref.current?.click()}
          className="focus-ring shrink-0 rounded bg-warning/15 px-2.5 py-1 text-xs font-medium text-warning transition-colors hover:bg-warning/25"
        >
          {t("Choose file")}
        </button>
        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
          {chosen.length === 0
            ? t("No file chosen")
            : chosen.length === 1
              ? chosen[0]
              : `${chosen.length} ${t("files")}`}
        </span>
      </div>
    </>
  );

  /*
    ONE ROW, LABEL AND PICKER TOGETHER.

    This was a panel: a two-line heading, the picker under it, and a sentence
    under that explaining why proof is worth attaching. Three stacked blocks
    for an optional field, sitting between the account and the confirm button
    on the busiest form in the app.

    The office knows what a payment slip is. The label says which field this is
    and the amber says it matters; both fit on the line the picker is already
    on, and the whole thing costs one row instead of five.
  */
  return (
    <div
      className={`flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-md border border-warning/40 bg-warning/5 px-2.5 ${
        compact ? "py-1.5" : "py-2"
      }`}
    >
      <label
        htmlFor={id}
        className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-warning"
      >
        <Paperclip className="h-3.5 w-3.5 shrink-0" />
        {t("Proof")}
      </label>
      <div className="min-w-0 flex-1">{picker}</div>
    </div>
  );
}
