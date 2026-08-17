"use client";

import { useState, useTransition } from "react";

import { useLocale, useT } from "@/components/app/locale-provider";
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
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="shrink-0">
      <NativeSelect
        aria-label={t("Request status")}
        disabled={pending}
        defaultValue={status}
        onChange={(event) => {
          /*
            The refusal, said out loud, and the select put back.

            The result was thrown away. A clerk who left this queue open over
            lunch and lost their session set a request to "Contacted"; the
            action returned "Not signed in.", nobody read it, and because the
            select is a `defaultValue` its DOM value stayed on Contacted even
            after the server component re-rendered. So the desk believed that
            customer had been rung, and nobody ever rang them.

            The locale goes with it too: the action translates its own refusal
            and defaults to English, so a Chinese-reading desk was being
            promised an English message it was never shown.
          */
          const select = event.target;
          const next = select.value;
          setError(null);
          start(async () => {
            const result = await setRequestStatus(kind, id, next, locale);
            if (!result.ok) {
              setError(result.error);
              select.value = status;
            }
          });
        }}
        className="h-9 w-44 text-xs"
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.label)}
          </option>
        ))}
      </NativeSelect>
      {error ? (
        <p role="alert" className="mt-1 w-44 text-[11px] text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
