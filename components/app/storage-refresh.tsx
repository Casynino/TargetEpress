"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { updateStorageNow } from "@/lib/actions/storage";
import type { ActionResult } from "@/lib/actions/types";

/**
 * Not how storage gets charged — how somebody stops waiting for the night run.
 *
 * The meter runs by itself every night and again whenever the warehouse scans
 * a box, so this button exists for the person standing in front of the screen
 * who wants today's figures on the bills before six tomorrow morning. Pressing
 * it twice does nothing the second time; the figures are already right.
 */
export function StorageRefresh() {
  const t = useT();
  const [state, run] = useActionState<
    ActionResult<{ charged: number; usd: number }> | undefined,
    FormData
  >(() => updateStorageNow(), undefined);

  return (
    <form action={run} className="flex flex-wrap items-center gap-3">
      <SubmitButton size="sm" variant="outline" pendingLabel={t("Working…")}>
        <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
        {t("Put today's storage on the bills")}
      </SubmitButton>
      {state?.ok && state.data ? (
        <p className="text-xs text-muted-foreground">
          {state.data.charged === 0
            ? t("Every bill was already up to date.")
            : `${state.data.charged} ${t("bill(s) brought up to date")} · USD ${state.data.usd.toFixed(2)}`}
        </p>
      ) : null}
      <FormError state={state} />
    </form>
  );
}
