"use client";

import { useActionState, useState } from "react";
import { Pencil, Plane } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateFlightDetails } from "@/lib/actions/batches";

/**
 * The flight, filled in after the cargo has already gone.
 *
 * The boxes reach the airport and then wait for the airline to issue a
 * waybill, so at dispatch none of this is known — and what is typed later is
 * corrected again when the airline moves the flight. Every field is therefore
 * optional and every field stays editable: this is a record being kept up to
 * date, not a form being completed once.
 *
 * The day it LANDED is deliberately not here. That is written by the Dar floor
 * marking the flight arrived, and the storage clock counts from it.
 */
export function FlightDetailsForm({
  batchId,
  batchNumber,
  waybillNumber,
  airline,
  departureDate,
  expectedArrival,
  notes,
}: {
  batchId: string;
  batchNumber: string;
  waybillNumber: string | null;
  airline: string | null;
  /** ISO yyyy-mm-dd, or null when nobody knows yet. */
  departureDate: string | null;
  expectedArrival: string | null;
  notes: string | null;
}) {
  const t = useT();
  const [state, action] = useActionState(updateFlightDetails, undefined);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring ml-auto inline-flex h-11 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-brand md:h-7"
      >
        <Pencil className="h-3.5 w-3.5" />
        {t("Edit flight")}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="mt-2 w-full space-y-3 rounded-lg border bg-background p-3"
    >
      <input type="hidden" name="batchId" value={batchId} />
      <p className="flex items-center gap-2 text-sm font-medium">
        <Plane className="h-4 w-4 text-brand" />
        {t("Flight details")} · {batchNumber}
      </p>
      <p className="text-xs text-muted-foreground">
        {t(
          "Fill in whatever the airline has given you. Anything still unknown can stay empty and be added later — the cargo does not wait for it."
        )}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="fd-airline" className="text-xs">{t("Airline")}</Label>
          <Input id="fd-airline" name="airline" defaultValue={airline ?? ""} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="fd-waybill" className="text-xs">{t("Waybill number")}</Label>
          <Input
            id="fd-waybill"
            name="waybillNumber"
            defaultValue={waybillNumber ?? ""}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            {t("Leave it empty until the airline issues it.")}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="fd-departed" className="text-xs">{t("Departure date")}</Label>
          <Input
            id="fd-departed"
            name="departureDate"
            type="date"
            defaultValue={departureDate ?? ""}
          />
          <p className="text-xs text-muted-foreground">
            {t("The day it really left, not the day it was booked for.")}
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="fd-expected" className="text-xs">{t("Expected arrival")}</Label>
          <Input
            id="fd-expected"
            name="expectedArrival"
            type="date"
            defaultValue={expectedArrival ?? ""}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="fd-notes" className="text-xs">{t("Notes")}</Label>
          <Textarea id="fd-notes" name="notes" rows={2} defaultValue={notes ?? ""} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="fd-reason" className="text-xs">
            {t("What changed")} <span className="text-muted-foreground">({t("optional")})</span>
          </Label>
          <Input
            id="fd-reason"
            name="reason"
            placeholder={t("Airline moved the flight to the 25th")}
          />
        </div>
      </div>

      <FormError state={state} />
      {state?.ok ? (
        <p className="rounded-md border border-success/30 bg-success/5 p-2 text-xs text-success">
          {t("Saved.")}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton size="sm" variant="brand" pendingLabel={t("Saving…")}>
          {t("Save flight details")}
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="focus-ring rounded-md px-2 text-xs text-muted-foreground hover:text-foreground"
        >
          {t("Close")}
        </button>
      </div>
    </form>
  );
}
