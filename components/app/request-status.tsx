"use client";

import { useTransition } from "react";

import { useT } from "@/components/app/locale-provider";
import { NativeSelect } from "@/components/ui/native-select";
import { setRequestStatus } from "@/lib/actions/requests-admin";

const OPTIONS = [
  { value: "PENDING", label: "Waiting for a call" },
  { value: "CONTACTED", label: "Contacted" },
  { value: "SCHEDULED", label: "Scheduled" },
  { value: "COMPLETED", label: "Done" },
  { value: "CANCELLED", label: "Cancelled" },
];

/**
 * Moving a request along.
 *
 * A select rather than a row of buttons: these go backwards as often as
 * forwards — a customer who stopped answering the phone goes from Scheduled
 * back to Contacted — and a one-way set of buttons quietly encourages people
 * to leave the record wrong instead.
 */
export function RequestStatusPicker({
  kind,
  id,
  status,
}: {
  kind: "booking" | "pickup";
  id: string;
  status: string;
}) {
  const t = useT();
  const [pending, start] = useTransition();

  return (
    <NativeSelect
      aria-label={t("Request status")}
      disabled={pending}
      defaultValue={status}
      onChange={(event) => {
        const next = event.target.value;
        start(() => void setRequestStatus(kind, id, next));
      }}
      className="h-9 w-44 text-xs"
    >
      {OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {t(option.label)}
        </option>
      ))}
    </NativeSelect>
  );
}
