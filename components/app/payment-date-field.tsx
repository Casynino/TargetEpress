"use client";

import { useState } from "react";
import { CalendarDays } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The date the money arrived — out of the way until somebody needs it.
 *
 * It is today, every time, for almost every payment this business takes: a
 * customer pays and the desk records it there and then. Asking for it as a
 * full field made the common case read as a question, and the owner is right
 * that a form should not ask what it already knows.
 *
 * It is NOT removed, because the one case it exists for is real: a Friday
 * transfer entered on Monday belongs to Friday. The payments report follows
 * this date, and a payment in a foreign currency is valued at the rate
 * published on it — so recording Monday's rate against Friday's money puts a
 * wrong figure in the books. One tap opens it; nobody who does not need it
 * ever sees it.
 */
export function PaymentDateField({
  id = "paidAt",
  name = "paidAt",
  today,
}: {
  id?: string;
  name?: string;
  /** Today, formatted yyyy-mm-dd by the server so the two agree on the day. */
  today: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        {/* Posted whether or not the field is on screen, so the action always
            receives the day the desk is actually working. Today is the default
            and saying so was one more line to read past. */}
        <input type="hidden" name={name} value={today} />
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="focus-ring inline-flex items-center gap-1 rounded text-xs font-medium text-brand underline-offset-2 hover:underline"
        >
          <CalendarDays className="h-3.5 w-3.5" />
          {t("Click here if you wish to change the date")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {t("Payment date")}
      </Label>
      <Input id={id} name={name} type="date" max={today} defaultValue={today} />
      <p className="text-xs text-muted-foreground">
        {t(
          "A Friday transfer entered on Monday belongs to Friday, and the payments report follows this date."
        )}
      </p>
    </div>
  );
}
