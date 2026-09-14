"use client";

import { useActionState, useState } from "react";
import { Scale, Check, X, Undo2 } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import {
  decidePriceChange,
  withdrawPriceRequest,
} from "@/lib/actions/price-requests";
import type { ActionResult } from "@/lib/actions/types";

/**
 * THE PRICE THE COUNTER AGREED, WAITING ON SOMEBODY WHO MAY AGREE IT.
 *
 * Loud, and at the top of the bill, because the figure printed underneath is
 * NOT the figure being asked for — and a reader who misses that will quote the
 * customer the wrong one. Both numbers are on it for the same reason: what the
 * bill says now, and what it would say.
 *
 * Whoever asked sees a way to take it back and no way to agree it. That is not
 * only the buttons: decidePriceChange compares the person, not the department,
 * so a manager holding both cannot send a price up and sign it off in one
 * breath.
 */
export function PriceRequestPanel({
  requestId,
  currency,
  standingTotal,
  proposedTotal,
  freightFrom,
  freightTo,
  reason,
  askedBy,
  askedAt,
  canDecide,
  canWithdraw,
}: {
  requestId: string;
  currency: string;
  /** What the customer owes right now. Unchanged until this is agreed. */
  standingTotal: number;
  proposedTotal: number;
  freightFrom: number;
  freightTo: number;
  reason: string;
  askedBy: string;
  askedAt: string;
  /** Holds invoice.discount AND did not ask for this one. */
  canDecide: boolean;
  canWithdraw: boolean;
}) {
  const t = useT();
  const [mode, setMode] = useState<null | "approve" | "reject">(null);
  const [decide, decideAction] = useActionState<
    ActionResult<{ approved: boolean }> | undefined,
    FormData
  >(decidePriceChange, undefined);
  const [withdraw, withdrawAction] = useActionState<
    ActionResult<{ withdrawn: boolean }> | undefined,
    FormData
  >(withdrawPriceRequest, undefined);

  const difference = Math.round((proposedTotal - standingTotal) * 100) / 100;
  const money = (n: number) => `${currency} ${n.toFixed(2)}`;

  return (
    <div className="no-print mb-6 rounded-xl border border-brand/40 bg-brand/5 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
          <Scale className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{t("A price is waiting on Finance")}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("Until it is agreed, the customer owes the figure on this bill and the cargo stays where it is.")}
          </p>

          {/* Both figures, because the one printed below is not the one being
              asked for. */}
          <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border bg-card px-3 py-2">
              <dt className="text-[11px] text-muted-foreground">
                {t("The bill says")}
              </dt>
              <dd className="font-mono text-sm font-semibold tabular-nums">
                {money(standingTotal)}
              </dd>
            </div>
            <div className="rounded-lg border border-brand/40 bg-card px-3 py-2">
              <dt className="text-[11px] text-muted-foreground">
                {t("Asked for")}
              </dt>
              <dd className="font-mono text-sm font-semibold tabular-nums text-brand">
                {money(proposedTotal)}
              </dd>
            </div>
            <div className="rounded-lg border bg-card px-3 py-2">
              <dt className="text-[11px] text-muted-foreground">
                {t("Difference")}
              </dt>
              <dd
                className={`font-mono text-sm font-semibold tabular-nums ${
                  difference < 0 ? "text-warning" : "text-foreground"
                }`}
              >
                {difference > 0 ? "+" : ""}
                {money(difference).replace(`${currency} -`, `${currency} −`)}
              </dd>
            </div>
          </dl>

          {Math.abs(freightTo - freightFrom) > 0.005 ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("Air freight")}:{" "}
              <span className="font-mono tabular-nums">{money(freightFrom)}</span>
              {" → "}
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {money(freightTo)}
              </span>
            </p>
          ) : null}

          <p className="mt-3 rounded-lg border bg-card px-3 py-2 text-sm">
            <span className="text-muted-foreground">{t("Reason")}: </span>
            {reason}
          </p>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {t("Asked by")} {askedBy} · {askedAt}
          </p>

          <FormError state={decide} />
          <FormError state={withdraw} />

          {canDecide ? (
            mode === null ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setMode("approve")}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
                >
                  <Check className="h-3.5 w-3.5" />
                  {t("Agree this price")}
                </button>
                <button
                  type="button"
                  onClick={() => setMode("reject")}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
                >
                  <X className="h-3.5 w-3.5" />
                  {t("Refuse it")}
                </button>
              </div>
            ) : (
              <form action={decideAction} className="mt-3 space-y-2">
                <input type="hidden" name="requestId" value={requestId} />
                <input
                  type="hidden"
                  name="decision"
                  value={mode === "approve" ? "APPROVE" : "REJECT"}
                />
                <Input
                  name="decisionNote"
                  placeholder={
                    mode === "approve"
                      ? t("Note (optional) — the desk reads this")
                      : t("Say why, so the desk can tell the customer")
                  }
                  className="h-8 text-xs"
                />
                <div className="flex items-center gap-2">
                  <SubmitButton
                    size="sm"
                    variant={mode === "approve" ? "brand" : "destructive"}
                    pendingLabel={t("Saving…")}
                  >
                    {mode === "approve"
                      ? `${t("Agree")} ${money(proposedTotal)}`
                      : t("Refuse this price")}
                  </SubmitButton>
                  <button
                    type="button"
                    onClick={() => setMode(null)}
                    className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                  >
                    {t("Cancel")}
                  </button>
                </div>
              </form>
            )
          ) : canWithdraw ? (
            <form action={withdrawAction} className="mt-3">
              <input type="hidden" name="requestId" value={requestId} />
              <SubmitButton size="sm" variant="outline" pendingLabel={t("Taking it back…")}>
                <Undo2 className="mr-1.5 h-3.5 w-3.5" />
                {t("Take this back")}
              </SubmitButton>
            </form>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("Finance will agree or refuse this price.")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
