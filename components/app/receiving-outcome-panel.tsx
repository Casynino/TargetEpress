"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Camera,
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
import {
  gapOf,
  WEIGH_BOX,
  WeighFigures,
} from "@/components/app/weigh-figures";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { CARGO_PHYSICALLY_HERE } from "@/lib/cargo-presence";
import { typeLocksPickup } from "@/lib/pickup-lock";
import {
  DAMAGE_SEVERITY_LABELS,
  PACKAGE_TYPE_LABELS,
  SHIPMENT_STATUS_META,
  enumOptions,
} from "@/lib/constants";
import {
  RECEIVING_OUTCOMES,
  RECEIVING_OUTCOME_EXCEPTION,
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
  /* The same figure as present.length, held as text so the box can be cleared
     and retyped without snapping back to a number mid-keystroke. */
  const [boxText, setBoxText] = useState(String(packageList.length));
  /* Shut until asked for. Damage demands a photograph; every other fault only
     offers one. */
  const [photo, setPhoto] = useState(false);

  const unit = PACKAGE_TYPE_LABELS[packageType] ?? PACKAGE_TYPE_LABELS.PACKAGE;
  const ticker = outcome ? outcomeNeedsPackageTicker(outcome) : false;
  const manyBoxes = packageList.length > 1;
  const missingCount = packageList.length - present.length;
  /* Only OVER_QUANTITY reads this — the figure the clerk counted on the floor
     when there are more cartons than the manifest knows about. */
  const [arrived, setArrived] = useState(packageList.length + 1);

  /* The scale, on this path too. Held in state rather than left uncontrolled so
     the difference beside it moves as the figure is typed — the same block the
     tick path shows, because it is the same question. */
  const [kg, setKg] = useState(String(weightKg));
  const nowKg = Number(kg);
  const kgValid = Number.isFinite(nowKg) && nowKg > 0;
  const kgDelta = kgValid ? gapOf(nowKg, weightKg) : 0;
  const kgMoved = kgValid && Math.abs(kgDelta) > 0.005;

  /*
    WHERE THE CARGO ENDS UP, READ FROM THE TABLE THE SERVER READS.

    This promised "Under investigation" under every one of the ten faults, and
    it was true of three. A damaged carton, a wrong item, a box with no label
    and four extra pieces are all on the floor: verifyShipment receives them,
    prices them, and leaves the case to hold them off the pickup counter. A
    clerk told otherwise stops trusting the sentence.

    Derived rather than restated, so a new outcome cannot describe itself
    wrongly — CARGO_PHYSICALLY_HERE is the same table the check-in branches on.
  */
  const fault = outcome ? RECEIVING_OUTCOME_EXCEPTION[outcome] : null;
  const staysHere = fault !== null && CARGO_PHYSICALLY_HERE[fault];
  /* And whether the case actually stops a handover. Not every open case does —
     a wrong description and a disputed weight are both recorded against cargo
     the customer is still entitled to collect. typeLocksPickup is the same
     table the release counter itself reads. */
  const holdsIt = fault !== null && typeLocksPickup(fault);

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
              fault — so it is offered on this path too, said in the same three
              figures as the tick path, and changes nothing unless somebody
              types over it. */}
          <div className="rounded-md border bg-card p-3">
            <WeighFigures
              label="weight"
              was={String(weightKg)}
              unit="kg"
              delta={kgDelta}
              moved={kgMoved}
            >
              <input
                name="weightKg"
                type="number"
                step="0.01"
                min="0"
                inputMode="decimal"
                value={kg}
                onChange={(event) => setKg(event.target.value)}
                className={WEIGH_BOX}
                aria-label={t("Weight in Dar")}
              />
            </WeighFigures>
          </div>

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

              {/*
                THE THREE FIGURES, SAID AS FIGURES.

                The line under the ticker explains the consequence in a
                sentence, which is the right thing to read once. This is what
                the owner asked to see every time: what the manifest says, what
                is on the floor, and the difference between them — in a shape a
                clerk can check against the pallet without reading anything.
              */}
              {/* Counted the way the scale is read: what China sent, what is on
                  the floor, and the gap. A typed number rather than a figure
                  the clerk has to assemble by unticking — the owner asked for
                  the same control the weight has, and a single-carton
                  consignment showed no figures at all before. */}
              <div className="mb-2 rounded-md border bg-card p-3">
                <WeighFigures
                  label="boxes"
                  was={String(packageList.length)}
                  unit={unit.many}
                  delta={-missingCount}
                  moved={missingCount > 0}
                >
                  <input
                    type="number"
                    min="0"
                    max={packageList.length}
                    step="1"
                    inputMode="numeric"
                    value={boxText}
                    onChange={(event) => {
                      const typed = event.target.value;
                      setBoxText(typed);
                      const n = Number(typed);
                      if (
                        Number.isInteger(n) &&
                        n >= 0 &&
                        n <= packageList.length
                      ) {
                        /* The first n cartons stand for the ones on the floor.
                           Which n is only a guess until somebody unticks the
                           real ones below, and the server is told the ids
                           either way — a count alone would leave the release
                           counter unable to say which box it is waiting for. */
                        setPresent(
                          packageList.slice(0, n).map((pkg) => pkg.id)
                        );
                      }
                    }}
                    className={WEIGH_BOX}
                    aria-label={t("Boxes counted in Dar")}
                  />
                </WeighFigures>
              </div>

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
                            setPresent((current) => {
                              const next = current.includes(pkg.id)
                                ? current.filter((id) => id !== pkg.id)
                                : [...current, pkg.id];
                              setBoxText(String(next.length));
                              return next;
                            })
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

          {/*
            MORE THAN WAS BOOKED.

            The ticker cannot ask this — there is no eleventh row to tick — so
            this is the one outcome where a number is the honest control. What
            it produces is boxes: a row and a QR each, minted on the server, so
            the extra carton can be labelled, scanned and released like every
            other. The booked figure stays in the shipment's history.
          */}
          {outcome === "OVER_QUANTITY" ? (
            <div className="space-y-2 rounded-md border border-info/40 bg-info/5 p-2.5">
              <label className="flex items-center justify-between gap-2 text-xs">
                <span className="font-medium">{t("How many arrived?")}</span>
                <span className="inline-flex items-center gap-1">
                  <input
                    name="packagesArrived"
                    type="number"
                    min={packageList.length + 1}
                    step="1"
                    inputMode="numeric"
                    defaultValue={packageList.length + 1}
                    onChange={(event) =>
                      setArrived(Number(event.target.value) || 0)
                    }
                    className="focus-ring w-20 rounded border bg-card px-2 py-1 text-right tabular-nums outline-none"
                  />
                  <span className="text-muted-foreground">{t(unit.many)}</span>
                </span>
              </label>
              <dl className="grid grid-cols-3 gap-2 text-center text-xs">
                <div>
                  <dt className="text-muted-foreground">{t("Booked")}</dt>
                  <dd className="font-semibold tabular-nums">
                    {packageList.length}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("Arrived")}</dt>
                  <dd className="font-semibold tabular-nums">{arrived}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("Difference")}</dt>
                  <dd className="font-semibold tabular-nums text-info">
                    +{Math.max(0, arrived - packageList.length)}
                  </dd>
                </div>
              </dl>
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

          {/* WHAT IS ACTUALLY IN THE CARTON.

              The owner asked for it on a wrong item, and it is the same
              argument as the damage photograph: the box is open, the clerk is
              holding it, and this is the only moment the picture exists. It is
              offered, never demanded — a corrected description is not a claim,
              and a mandatory picture on every fault is the step that stops the
              work. */}
          {outcome !== "RECEIVED" && outcome !== "DAMAGED" ? (
            photo ? (
              <PhotoCapture
                name="photos"
                max={4}
                label="Photo (optional)"
                hint="What is actually in the carton, and the label beside it."
                durable={photosDurable}
              />
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPhoto(true)}
              >
                <Camera className="mr-1.5 h-4 w-4" />
                {t("Add a photo (optional)")}
              </Button>
            )
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
                <span className="font-medium">
                  {staysHere
                    ? t(SHIPMENT_STATUS_META.RECEIVED_AT_DAR.label)
                    : t("Under investigation")}
                </span>
                {!staysHere
                  ? t(", not Ready for pickup.")
                  : holdsIt
                    ? t(", and the case holds it off the pickup counter.")
                    : t(". The case is recorded against it and does not hold it.")}
                {/* The split, in the owner's words: what goes on the shelf and
                    what somebody has to go looking for. Only where boxes were
                    actually named, because everywhere else there is no split
                    to state. */}
                {ticker && missingCount > 0 ? (
                  <>
                    {" "}
                    <span className="font-medium text-foreground">
                      {t("Into the warehouse:")} {present.length}
                    </span>
                    {" · "}
                    <span className="font-medium text-warning">
                      {t("To the case:")} {missingCount}
                    </span>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}
