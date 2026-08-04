"use client";

import { useActionState, useState } from "react";
import type { ResolutionType } from "@prisma/client";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveInvestigation } from "@/lib/actions/investigations";
import type { ActionResult } from "@/lib/actions/types";
import {
  RESOLUTION_NOTE_REQUIRED,
  RESOLUTION_TYPE_LABELS,
} from "@/lib/constants";

/**
 * Closing a case, with an answer attached.
 *
 * One question — what happened — and only the fields that answer belongs to.
 * Choosing "cargo found" must not present compensation fields; a form that
 * shows every option's inputs at once is the complicated form the owner asked
 * not to have.
 *
 * Everything enforced here is enforced again in the server action. The
 * `required` attributes below are a courtesy to whoever is typing, not the
 * rule: the action is reachable without this form and does its own checking.
 */

const ORDER: ResolutionType[] = [
  "CARGO_FOUND",
  "WEIGHT_CORRECTED",
  "DAMAGE_SETTLED",
  "CARGO_LOST",
  "OTHER",
];

const HINT: Record<ResolutionType, string> = {
  CARGO_FOUND: "The box turned up. The cargo goes back to its normal status.",
  WEIGHT_CORRECTED: "The cargo was fine; the recorded weight was not.",
  DAMAGE_SETTLED: "It arrived damaged and something was agreed.",
  CARGO_LOST: "It was never found.",
  OTHER: "Anything the four above do not describe.",
};

export function ResolveInvestigationForm({
  exceptionId,
}: {
  exceptionId: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    resolveInvestigation,
    { ok: true }
  );
  const [type, setType] = useState<ResolutionType | "">("");
  const [was, setWas] = useState("");
  const [now, setNow] = useState("");

  const noteRequired = type
    ? RESOLUTION_NOTE_REQUIRED.includes(type)
    : false;

  // Shown as the operator types, so a fat-fingered figure is visible before it
  // is filed. The server recomputes it from the two weights — this is a
  // preview, never the stored value.
  const difference =
    was.trim() && now.trim() && !Number.isNaN(Number(was)) && !Number.isNaN(Number(now))
      ? (Number(now) - Number(was)).toFixed(2)
      : null;

  return (
    <form action={action} className="space-y-4 rounded-lg border p-3">
      <input type="hidden" name="exceptionId" value={exceptionId} />

      <div className="space-y-2">
        <p className="text-xs font-medium">What happened?</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ORDER.map((option) => (
            <label
              key={option}
              className={`flex cursor-pointer items-start gap-2 rounded-md border p-2 text-sm transition-colors ${
                type === option
                  ? "border-brand bg-brand/5"
                  : "hover:bg-muted/50"
              }`}
            >
              <input
                type="radio"
                name="resolutionType"
                value={option}
                checked={type === option}
                onChange={() => setType(option)}
                className="mt-0.5"
                required
              />
              <span className="min-w-0">
                <span className="block font-medium">
                  {RESOLUTION_TYPE_LABELS[option]}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {HINT[option]}
                </span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* Only the chosen outcome's fields. */}
      {type === "CARGO_FOUND" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`found-${exceptionId}`} className="text-xs">
            Where was it found? <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id={`found-${exceptionId}`}
            name="foundLocation"
            placeholder="e.g. Shelf B-12, behind the Guangzhou pallet"
          />
        </div>
      ) : null}

      {type === "WEIGHT_CORRECTED" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor={`was-${exceptionId}`} className="text-xs">
              Previous weight (kg)
            </Label>
            <Input
              id={`was-${exceptionId}`}
              name="weightWasKg"
              inputMode="decimal"
              value={was}
              onChange={(e) => setWas(e.target.value)}
              placeholder="20"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`now-${exceptionId}`} className="text-xs">
              Actual weight (kg)
            </Label>
            <Input
              id={`now-${exceptionId}`}
              name="weightNowKg"
              inputMode="decimal"
              value={now}
              onChange={(e) => setNow(e.target.value)}
              placeholder="23"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Difference</Label>
            <p className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm tabular">
              {difference === null ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <span className={Number(difference) < 0 ? "text-warning" : ""}>
                  {Number(difference) > 0 ? "+" : ""}
                  {difference} kg
                </span>
              )}
            </p>
          </div>
        </div>
      ) : null}

      {type === "DAMAGE_SETTLED" ? (
        <div className="space-y-1.5">
          <Label htmlFor={`outcome-${exceptionId}`} className="text-xs">
            How was it settled?
          </Label>
          <Input
            id={`outcome-${exceptionId}`}
            name="damageOutcome"
            placeholder="e.g. Customer accepted the cargo after agreement"
            required
          />
        </div>
      ) : null}

      {type === "CARGO_LOST" ? (
        <div className="flex flex-wrap gap-4 rounded-md border bg-muted/30 p-3">
          {/* The two questions somebody always asks about a lost box. Whether
              money is owed, not how much — the amount is Finance's and lives
              on the compensation record. */}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="compensationOwed" value="yes" />
            Customer compensation required
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="financeNotified" value="yes" />
            Finance notified
          </label>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor={`note-${exceptionId}`} className="text-xs">
          Resolution note{" "}
          {type && !noteRequired ? (
            <span className="text-muted-foreground">(optional)</span>
          ) : null}
        </Label>
        <textarea
          id={`note-${exceptionId}`}
          name="resolutionNote"
          rows={2}
          required={noteRequired}
          placeholder="What happened, and how it was solved."
          className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </div>

      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" name="confirm" value="yes" required className="mt-0.5" />
        <span>
          I confirm this is what happened. The case closes and stays on the
          record.
        </span>
      </label>

      <SubmitButton size="sm" variant="brand" pendingLabel="Closing…">
        Confirm resolution
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}
