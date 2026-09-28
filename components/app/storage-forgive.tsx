"use client";

import { useActionState, useState } from "react";
import { HandCoins } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { forgiveStorageOnCleared } from "@/lib/actions/storage";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Two presses, because forgiving money should not be one.
 *
 * The count and the figure are worked out on the server and printed on the
 * button, so whoever presses it has read what it will do before they do it.
 */
export function StorageForgive({
  count,
  amount,
}: {
  count: number;
  amount: string;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [state, run] = useActionState<
    ActionResult<{ count: number; usd: number }> | undefined,
    FormData
  >(() => forgiveStorageOnCleared(), undefined);

  if (state?.ok && state.data) {
    return (
      <p className="text-xs text-success">
        {state.data.count} {t("consignment(s) forgiven")} · {state.data.usd.toFixed(2)} USD
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {t(
          "These customers have paid in full and their cargo is cleared to collect. Forgiving the days they have stood here means nobody is turned away at the counter over storage they were never told about; every other bill is charged as normal."
        )}
      </p>
      {asking ? (
        <form action={run} className="flex flex-wrap items-center gap-2">
          <SubmitButton
            size="sm"
            variant="destructive"
            pendingLabel={t("Forgiving…")}
          >
            {`${t("Yes — forgive")} ${count} ${t("consignment(s)")} · ${amount}`}
          </SubmitButton>
          <button
            type="button"
            onClick={() => setAsking(false)}
            className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("Cancel")}
          </button>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAsking(true)}
          className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-warning/40 px-2.5 py-1.5 text-xs font-semibold text-warning transition-colors hover:bg-warning/10"
        >
          <HandCoins className="h-3.5 w-3.5" />
          {`${t("Forgive the days on paid, cleared cargo")} · ${count}`}
        </button>
      )}
      <FormError state={state} />
    </div>
  );
}
