"use client";

import { useActionState, useState } from "react";
import { AlertTriangle, Check, Scale } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { ReceivingOutcomePanel } from "@/components/app/receiving-outcome-panel";
import { VerifyPanel } from "@/components/app/verify-panel";
import { verifyShipment } from "@/lib/actions/batches";
import type { ActionResult } from "@/lib/actions/types";

/**
 * The three answers, on the cargo's own page.
 *
 * The check-in list is built for a pallet: eighty-seven rows, scanned down a
 * column of tracking numbers. But a clerk who has opened ONE consignment —
 * because a customer rang about it, or because the carton looked wrong — was
 * sent back to that list to answer for it, and had to find the row again.
 *
 * Same server action, same three answers, same panels. Nothing here is a second
 * way of checking cargo in; it is the same door, in the other room somebody is
 * standing in.
 */
export function CargoCheckIn({
  batchId,
  shipmentId,
  trackingNumber,
  weightKg,
  packageType,
  packageList,
  photosDurable,
}: {
  batchId: string;
  shipmentId: string;
  trackingNumber: string;
  weightKg: number;
  packageType: string;
  packageList: { id: string; sequence: number }[];
  photosDurable: boolean;
}) {
  const t = useT();
  const [state, action] = useActionState<ActionResult, FormData>(
    verifyShipment,
    { ok: true }
  );
  const [weighing, setWeighing] = useState(false);
  const [flagging, setFlagging] = useState(false);

  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <div className="border-b px-5 py-4">
        <h2 className="font-display text-lg font-bold">{t("Check it in")}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {t(
            "This cargo is on a flight that has landed and has not been checked in yet."
          )}
        </p>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          {/* The answer taken almost every time, in one press. The other ten
              live behind the triangle, exactly as they do on the list. */}
          <form action={action}>
            <input type="hidden" name="batchId" value={batchId} />
            <input type="hidden" name="shipmentId" value={shipmentId} />
            <input type="hidden" name="outcome" value="RECEIVED" />
            <SubmitButton variant="brand" size="sm" pendingLabel="Recording…">
              <Check className="mr-1.5 h-4 w-4" />
              {t("Check it in")}
            </SubmitButton>
          </form>

          {/* Its own opener, because a re-weigh is not a fault and does not
              belong under "what happened to this cargo?". */}
          <button
            type="button"
            onClick={() => {
              setWeighing((v) => !v);
              setFlagging(false);
            }}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-brand hover:bg-brand/5"
          >
            <Scale className="h-4 w-4" />
            {t("Correct the weight")}
          </button>

          <button
            type="button"
            onClick={() => {
              setFlagging((v) => !v);
              setWeighing(false);
            }}
            className="focus-ring inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/5"
          >
            <AlertTriangle className="h-4 w-4" />
            {t("Something is wrong")}
          </button>
        </div>

        {weighing ? (
          <VerifyPanel
            batchId={batchId}
            shipmentId={shipmentId}
            trackingNumber={trackingNumber}
            weightKg={weightKg}
            packages={packageList.length}
            photosDurable={photosDurable}
            action={action}
            onDone={() => setWeighing(false)}
          />
        ) : null}

        {flagging ? (
          <ReceivingOutcomePanel
            batchId={batchId}
            shipmentId={shipmentId}
            trackingNumber={trackingNumber}
            packageType={packageType}
            packageList={packageList}
            weightKg={weightKg}
            photosDurable={photosDurable}
            action={action}
          />
        ) : null}

        <FormError state={state} />
      </div>
    </section>
  );
}
