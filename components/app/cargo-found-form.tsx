"use client";

import { useActionState } from "react";
import { PackageCheck } from "lucide-react";
import type { ShipmentStatus } from "@prisma/client";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Input } from "@/components/ui/input";
import { markCargoFound } from "@/lib/actions/investigations";
import type { ActionResult } from "@/lib/actions/types";
import { SHIPMENT_STATUS_META } from "@/lib/constants";

type FoundResult = ActionResult<{
  trackingNumber: string;
  status: ShipmentStatus;
}>;

/**
 * "Cargo found."
 *
 * One line and one button, because it is pressed while standing in front of the
 * box holding a phone in the other hand. The note is required and it is the
 * whole value of the record: "found on the wrong pallet in bay 3" is what stops
 * the next carton going the same way.
 *
 * The result says where the cargo landed, not just that it worked. Whether the
 * customer can now collect it depends on the invoice and on any other case
 * still open, and the person who found the box is the one who will be asked.
 */
export function CargoFoundForm({
  exceptionId,
  canMarkFound,
}: {
  exceptionId: string;
  canMarkFound: boolean;
}) {
  const [state, action] = useActionState<FoundResult, FormData>(
    markCargoFound,
    { ok: true }
  );

  if (!canMarkFound) return null;

  const found = state.ok && state.data ? state.data : null;

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="exceptionId" value={exceptionId} />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          name="note"
          placeholder="Where was it found? e.g. on the wrong pallet, bay 3"
          required
        />
        <SubmitButton size="default" variant="brand" pendingLabel="Recording…">
          <PackageCheck className="mr-2 h-4 w-4" />
          Cargo found
        </SubmitButton>
      </div>
      <FormError state={state} />
      {found ? (
        <p className="rounded-md border border-success/30 bg-success/5 p-2 text-xs text-success">
          {found.trackingNumber} is back in warehouse inventory as{" "}
          <strong>{SHIPMENT_STATUS_META[found.status].label}</strong>.
          {found.status === "RECEIVED_AT_DAR"
            ? " It is not on the pickup counter yet — either the freight is unpaid, there is no pickup note, or another case is still open on it."
            : null}
        </p>
      ) : null}
    </form>
  );
}
