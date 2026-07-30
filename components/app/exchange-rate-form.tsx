"use client";

import { useActionState, useState } from "react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { setExchangeRate } from "@/lib/actions/fx";

/**
 * Publishing a rate.
 *
 * Shows the arithmetic live against a USD 100 invoice, because the mistake that
 * matters here is a digit — 27000 for 2700 — and a wrong digit is far easier to
 * spot as "TZS 2,700,000 for a hundred dollars" than as a number in a box.
 */
export function ExchangeRateForm({ current }: { current: number | null }) {
  const [state, action] = useActionState(setExchangeRate, undefined);
  const [draft, setDraft] = useState("");

  const value = Number(draft);
  const valid = draft.trim().length > 0 && Number.isFinite(value) && value > 0;
  const move =
    valid && current !== null ? ((value - current) / current) * 100 : null;

  return (
    <form action={action} className="space-y-4">
      <FormError state={state} />
      {state?.ok ? (
        <p className="rounded-md border border-success/30 bg-success/5 p-3 text-sm text-success">
          Rate published
          {state.data ? `: 1 USD = ${state.data.rate.toLocaleString()} TZS` : ""}.
          Invoices already raised keep the rate they were raised at.
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="rate">New rate — shillings to one US dollar</Label>
        <Input
          id="rate"
          name="rate"
          inputMode="decimal"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={current ? String(current) : "2700"}
          required
          autoComplete="off"
        />
      </div>

      {valid ? (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-muted-foreground">A USD 100 invoice becomes</span>
            <span className="font-mono font-semibold tabular-nums">
              TZS {Math.round(value * 100).toLocaleString()}
            </span>
          </div>
          {move !== null ? (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {Math.abs(move) < 0.01
                ? "No change from the current rate."
                : `${move > 0 ? "Up" : "Down"} ${Math.abs(move).toFixed(2)}% from ${current?.toLocaleString()}.`}
              {Math.abs(move) > 10
                ? " That is a large move — check the digits."
                : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="notes">Why (optional)</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={2}
          placeholder="e.g. BOT mid-rate, 30 July"
        />
      </div>

      <SubmitButton pendingLabel="Publishing…">Publish rate</SubmitButton>
    </form>
  );
}
