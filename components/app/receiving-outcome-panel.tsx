"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  CircleHelp,
  Hash,
  Landmark,
  PackagePlus,
  PackageSearch,
  PackageX,
  PlaneTakeoff,
  ShieldAlert,
  Shuffle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { PhotoCapture } from "@/components/app/photo-capture";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  DAMAGE_SEVERITY_LABELS,
  PACKAGE_TYPE_LABELS,
  enumOptions,
} from "@/lib/constants";
import {
  RECEIVING_OUTCOMES,
  RECEIVING_OUTCOME_HINTS,
  RECEIVING_OUTCOME_LABELS,
  outcomeNeedsNote,
  outcomeNeedsPackageTicker,
  type ReceivingOutcome,
} from "@/lib/receiving-outcomes";

const OUTCOME_ICONS: Record<ReceivingOutcome, LucideIcon> = {
  RECEIVED: Check,
  DAMAGED: AlertTriangle,
  WRONG_ITEM: Shuffle,
  WRONG_QUANTITY: Hash,
  OVER_QUANTITY: PackagePlus,
  MISSING: PackageX,
  SHORT_LANDED: PlaneTakeoff,
  AT_CUSTOMS: Landmark,
  NO_LABEL: PackageSearch,
  RESTRICTED: ShieldAlert,
  HOLD: CircleHelp,
};

const NOTE_PLACEHOLDERS: Record<ReceivingOutcome, string> = {
  RECEIVED: "",
  DAMAGED: "e.g. one carton crushed down one side, contents wet",
  WRONG_ITEM: "e.g. label says phone cases, the box holds shoes",
  WRONG_QUANTITY: "e.g. manifest says five cartons, three on the floor",
  /* The ticker is off for this one, so the count lives here or nowhere. */
  OVER_QUANTITY: "e.g. manifest says three cartons, four on the floor — the fourth has no label",
  MISSING: "e.g. nothing with this label came off the flight; not on any pallet",
  SHORT_LANDED: "e.g. offloaded in Guangzhou for weight, booked on Friday GZ-33",
  AT_CUSTOMS: "e.g. held by TRA for inspection, reference and who is following it up",
  NO_LABEL: "e.g. label torn off, matched to this booking by contents and weight",
  RESTRICTED: "e.g. two lithium power banks packed loose inside the carton",
  HOLD: "e.g. label unreadable and no paperwork — held until checked",
};

type PackageRow = { id: string; sequence: number };

/**
 * The six answers, on one carton.
 *
 * This replaced a dropdown of internal enum names sitting next to a free-text
 * box. The dropdown asked a clerk holding a torn box to pick which schema value
 * best described it, and offered "Weight mismatch" and "Wrong batch" — problems
 * an arrival clerk is not in a position to see — alongside the ones they are.
 *
 * So the choices are the six things that actually happen at a door, each one
 * says what it means in a sentence, and the fields that follow are only the
 * fields that outcome needs. Damage asks for photographs because the moment the
 * carton leaves the floor the picture cannot be taken any more. A short count
 * asks which boxes, because "some are missing" is not a thing anybody can
 * search a warehouse with.
 *
 * Everything posts to the same server action as the ✓ in the row above it —
 * this panel is the long way round to the same decision, not a second system.
 */
export function ReceivingOutcomePanel({
  batchId,
  shipmentId,
  trackingNumber,
  packageType,
  packageList,
  photosDurable,
  /** The booked weight, so a flagged carton can still be re-weighed. */
  weightKg,
  action,
}: {
  batchId: string;
  shipmentId: string;
  trackingNumber: string;
  packageType: string;
  packageList: PackageRow[];
  photosDurable: boolean;
  weightKg: number;
  /** The row's own action, so one error surface serves the whole row. */
  action: (formData: FormData) => void;
}) {
  const t = useT();
  const [outcome, setOutcome] = useState<ReceivingOutcome | null>(null);
  // Everything is assumed present — the common case is a complete shipment, and
  // the clerk only has to act on what is not.
  const [present, setPresent] = useState<string[]>(
    packageList.map((pkg) => pkg.id)
  );

  const unit = PACKAGE_TYPE_LABELS[packageType] ?? PACKAGE_TYPE_LABELS.PACKAGE;
  const ticker = outcome ? outcomeNeedsPackageTicker(outcome) : false;
  const manyBoxes = packageList.length > 1;
  const missingCount = packageList.length - present.length;

  // A short count on a multi-box shipment that is not actually short is not a
  // short count. Naming which boxes is the entire content of the report.
  const blocked = ticker && manyBoxes && missingCount === 0;

  return (
    <div className="mt-2 space-y-4 rounded-lg border border-destructive/30 bg-destructive/[0.03] p-3">
      <div>
        <p className="text-xs font-medium">{t("What happened to this cargo?")}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {t("Only")}{" "}
          <span className="font-medium">{t("Received")}</span>{" "}
          {t(
            "reaches the pickup counter. Everything else opens a case and holds the cargo."
          )}
        </p>
      </div>

      <div
        role="radiogroup"
        aria-label={`${t("Check-in outcome for")} ${trackingNumber}`}
        className="grid grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {RECEIVING_OUTCOMES.map((value) => {
          const Icon = OUTCOME_ICONS[value];
          const on = outcome === value;
          const clean = value === "RECEIVED";
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setOutcome(on ? null : value)}
              className={`focus-ring flex min-h-11 items-center gap-2 rounded-md border px-3 py-2 text-left text-sm font-medium transition-colors ${
                on
                  ? clean
                    ? "border-success bg-success/10 text-success"
                    : "border-destructive bg-destructive/10 text-destructive"
                  : "bg-card hover:bg-muted"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0">
                {t(RECEIVING_OUTCOME_LABELS[value])}
              </span>
            </button>
          );
        })}
      </div>

      {outcome ? (
        <form action={action} className="space-y-3 border-t pt-3">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="shipmentId" value={shipmentId} />
          <input type="hidden" name="outcome" value={outcome} />

          {/* A damaged carton is still weighed, and a wrong item is still
              weighed. The scale reading belongs to the check-in, not to the
              fault — so it is offered on this path too and, exactly as on the
              tick, changes nothing unless somebody types over it. */}
          <label className="flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs">
            <span className="font-medium">{t("Weight in Dar")}</span>
            <span className="inline-flex items-center gap-1">
              <input
                name="weightKg"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                defaultValue={weightKg}
                className="focus-ring w-20 rounded border bg-card px-2 py-1 text-right tabular-nums outline-none"
              />
              <span className="text-muted-foreground">{t("kg")}</span>
            </span>
          </label>

          <p className="text-xs text-muted-foreground">
            {t(RECEIVING_OUTCOME_HINTS[outcome])}
          </p>

          {/* Which boxes are on the floor. The short-shipment case is the only
              one that asks, and it always states its answer to the server —
              including on a single-box shipment, where the answer is "the one
              box is here and its contents are short". */}
          {ticker ? (
            <div>
              <input type="hidden" name="packageSelection" value="explicit" />
              {packageList.map((pkg) => (
                <input
                  key={pkg.id}
                  type="hidden"
                  name="packageIds"
                  value={present.includes(pkg.id) ? pkg.id : ""}
                />
              ))}

              {manyBoxes ? (
                <>
                  <p className="text-xs font-medium">
                    {t("Which")} {t(unit.many)} {t("are on the floor?")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {t("Untick anything that did not arrive.")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {packageList.map((pkg) => {
                      const on = present.includes(pkg.id);
                      return (
                        <button
                          key={pkg.id}
                          type="button"
                          aria-pressed={on}
                          aria-label={`${t(unit.one)} ${pkg.sequence} — ${on ? t("on the floor") : t("did not arrive")}`}
                          onClick={() =>
                            setPresent((current) =>
                              current.includes(pkg.id)
                                ? current.filter((id) => id !== pkg.id)
                                : [...current, pkg.id]
                            )
                          }
                          className={`inline-flex h-11 min-w-11 items-center justify-center rounded-md border px-3 text-sm font-semibold tabular transition-colors ${
                            on
                              ? "border-brand bg-brand/10 text-brand"
                              : "border-dashed border-destructive/50 text-destructive line-through"
                          }`}
                        >
                          {pkg.sequence}
                        </button>
                      );
                    })}
                  </div>
                  <p
                    className={`mt-2 text-xs ${missingCount > 0 ? "text-warning" : "text-muted-foreground"}`}
                  >
                    {missingCount > 0
                      ? `${missingCount} ${t("of")} ${packageList.length} ${t("short. The")} ${packageList.length - missingCount} ${t("that arrived are checked into the warehouse; release stays shut until the rest turn up.")}`
                      : `${t("Untick a")} ${t(unit.one)} ${t("above to record it short.")}`}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}

          {/* How bad, in the four words Finance and the customer both use. */}
          {outcome === "DAMAGED" ? (
            <div className="space-y-1.5">
              <Label htmlFor={`severity-${shipmentId}`} className="text-xs">
                {t("How bad is it?")}
              </Label>
              <NativeSelect
                id={`severity-${shipmentId}`}
                name="severity"
                defaultValue="MODERATE"
              >
                {enumOptions(DAMAGE_SEVERITY_LABELS).map((option) => (
                  <option key={option.value} value={option.value}>
                    {t(option.label)}
                  </option>
                ))}
              </NativeSelect>
            </div>
          ) : null}

          {outcomeNeedsNote(outcome) ? (
            <div className="space-y-1.5">
              <Label htmlFor={`note-${shipmentId}`} className="text-xs">
                {t("What did you see?")}
              </Label>
              <Textarea
                id={`note-${shipmentId}`}
                name="note"
                rows={2}
                required
                placeholder={t(NOTE_PLACEHOLDERS[outcome])}
              />
            </div>
          ) : null}

          {/* Evidence. Required on damage — this is the only moment the picture
              is takeable, and a damage claim with nothing behind it is worth
              nothing to the customer or to Finance. */}
          {outcome === "DAMAGED" ? (
            <PhotoCapture
              name="photos"
              required
              max={4}
              label="Photograph the damage"
              hint="The damage itself, and the label, so the case can be matched to the carton later."
              durable={photosDurable}
            />
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <SubmitButton
              variant={outcome === "RECEIVED" ? "brand" : "destructive"}
              disabled={blocked}
              pendingLabel="Recording…"
              className="h-11 text-sm"
            >
              {outcome === "RECEIVED"
                ? t("Check in — present & correct")
                : `${t("Open a case —")} ${t(RECEIVING_OUTCOME_LABELS[outcome]).toLowerCase()}`}
            </SubmitButton>
            {outcome !== "RECEIVED" ? (
              <p className="text-xs text-muted-foreground">
                {t("Tracking will read")}{" "}
                <span className="font-medium">{t("Under investigation")}</span>
                {t(", not Ready for pickup.")}
              </p>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
