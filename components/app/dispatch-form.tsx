"use client";

import { useActionState, useState } from "react";
import { Lock, PlaneTakeoff } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dispatchLoadingTable } from "@/lib/actions/batches";

/**
 * Sending a loading table on its way.
 *
 * Deliberately behind a confirm step. Dispatching moves every piece of cargo on
 * the table onto a flight in one irreversible action, so the count is shown
 * before the form opens and again on the button — a clerk should know they are
 * about to move 85 pieces, not discover it afterwards.
 */
export function DispatchForm({
  batchId,
  routeLabel,
  cargoCount,
  weightKg,
  packages,
}: {
  batchId: string;
  routeLabel: string;
  cargoCount: number;
  weightKg: number;
  packages: number;
}) {
  const t = useT();
  const [state, action] = useActionState(dispatchLoadingTable, undefined);
  const [open, setOpen] = useState(false);

  if (state?.ok && state.data) {
    return (
      <div className="rounded-xl border border-success/40 bg-success/5 p-5">
        <p className="flex items-center gap-2 font-display text-lg font-bold text-success">
          <PlaneTakeoff className="h-5 w-5" />
          {t("Dispatched")}
        </p>
        <p className="mt-1 text-sm">
          {state.data.cargo} {t(state.data.cargo === 1 ? "piece" : "pieces")}{" "}
          {t("left China as")}{" "}
          <span className="font-mono font-semibold">{state.data.dispatchNumber}</span>.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {routeLabel}{" "}
          {t("is empty again and ready for the next cargo.")}
        </p>
      </div>
    );
  }

  if (cargoCount === 0) {
    return (
      <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
        {t("Nothing on this table yet. Cargo appears here as the desk registers it.")}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border-2 border-brand/30 bg-card shadow-soft">
      <header className="flex flex-wrap items-center justify-between gap-4 bg-gradient-to-br from-brand/10 via-brand/5 to-transparent p-5">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand/15 text-brand">
            <Lock className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold">
              {t("Seal & dispatch")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("Close this table off and put it on a flight.")}
            </p>
            <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
              {cargoCount} {t(cargoCount === 1 ? "piece" : "pieces")} ·{" "}
              {packages} {t(packages === 1 ? "package" : "packages")} ·{" "}
              {weightKg.toFixed(1)} kg
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="lg"
          variant={open ? "ghost" : "brand"}
          className={open ? "" : "rounded-xl shadow-lift"}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? (
            t("Cancel")
          ) : (
            <>
              <PlaneTakeoff className="mr-2 h-4 w-4" />
              {t("Seal & dispatch")}
            </>
          )}
        </Button>
      </header>

      {open ? (
        <form action={action} className="space-y-4 p-4">
          <input type="hidden" name="batchId" value={batchId} />
          <FormError state={state} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="waybillNumber">
                {t("Waybill number")}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("if you have it")}
                </span>
              </Label>
              <Input
                id="waybillNumber"
                name="waybillNumber"
                placeholder="157-88345678"
                className="font-mono"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="airline">
                {t("Airline")}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("if you have it")}
                </span>
              </Label>
              <Input
                id="airline"
                name="airline"
                placeholder={t("Ethiopian Airlines")}
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="departureDate">
                {t("Departure date")}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("if you have it")}
                </span>
              </Label>
              <Input id="departureDate" name="departureDate" type="date" />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="expectedArrival">
                {t("Expected arrival")}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("optional")}
                </span>
              </Label>
              <Input id="expectedArrival" name="expectedArrival" type="date" />
              <p className="text-xs text-muted-foreground">
                {t(
                  "What Dar should expect. Actual arrival is recorded when it lands."
                )}
              </p>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="notes">
                {t("Notes")}{" "}
                <span className="font-normal text-muted-foreground">
                  {t("optional")}
                </span>
              </Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
          </div>

          <p className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm text-warning">
            {t("This moves all")} {cargoCount}{" "}
            {t(cargoCount === 1 ? "piece" : "pieces")}{" "}
            {t("onto the flight and cannot be undone.")} {routeLabel}{" "}
            {t("then starts empty.")}
          </p>

          <SubmitButton size="lg" variant="brand" className="rounded-xl" pendingLabel="Sealing and dispatching…">
            <PlaneTakeoff className="mr-2 h-4 w-4" />
            {t("Seal & dispatch")} {cargoCount}{" "}
            {t(cargoCount === 1 ? "piece" : "pieces")}
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
