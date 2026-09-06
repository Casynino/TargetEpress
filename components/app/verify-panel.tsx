"use client";

import { useState } from "react";
import { Camera, Check } from "lucide-react";

import { SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { PhotoCapture } from "@/components/app/photo-capture";
import {
  gapOf,
  WEIGH_BOX,
  WeighFigures,
} from "@/components/app/weigh-figures";
import { Button } from "@/components/ui/button";

/**
 * THE SCALE, BESIDE THE TICK.
 *
 * China writes a weight at booking; Dar puts the carton on a scale. They
 * disagree constantly — the tape, the pallet, a mistyped digit — and until now
 * the bill was struck on China's figure, because the clerk holding the box had
 * nowhere to put what the scale said.
 *
 * It sits on the ORDINARY path, not behind the ⚠. Correcting a weight is not a
 * problem with the cargo and the owner was explicit that it must not force
 * anybody to open a case. Pre-filled with the booked figure, so the clerk who
 * has nothing to correct presses the tick exactly as before and nothing moves.
 *
 * Written before the cargo is priced, so the bill is struck on this number —
 * which is what "priced at Dar check-in" was always supposed to mean.
 */
/**
 * WHAT ACTUALLY ARRIVED IN DAR.
 *
 * The whole purpose of this desk: China wrote a weight and a count when the
 * cargo was booked, and Dar says what is really on the floor. Two numbers,
 * typed as they are read off the scale and the pallet, and the system works
 * out the rest — how far each is from the China figure, which way, and what
 * the cargo is now priced on.
 *
 * NOTHING ELSE IS ASKED FOR. No reason, no claim, no investigation, no
 * photograph. A weight that moves is not a problem with the cargo; it is this
 * desk doing its job, and the owner was explicit that a mandatory picture on
 * every corrected kilo is a step that stops the work. The cargo is already
 * photographed and a photo stays available to anyone who wants one.
 *
 * Weigh · count · type · OK.
 */

export function VerifyPanel({
  batchId,
  shipmentId,
  trackingNumber,
  weightKg,
  packages,
  photosDurable,
  action,
  onDone,
}: {
  batchId: string;
  shipmentId: string;
  trackingNumber: string;
  weightKg: number;
  packages: number;
  photosDurable: boolean;
  action: (formData: FormData) => void;
  onDone: () => void;
}) {
  const t = useT();
  const [kg, setKg] = useState(String(weightKg));
  const [count, setCount] = useState(String(packages));
  const [photo, setPhoto] = useState(false);

  const nowKg = Number(kg);
  const kgValid = Number.isFinite(nowKg) && nowKg > 0;
  const kgDelta = kgValid ? gapOf(nowKg, weightKg) : 0;
  const kgMoved = kgValid && Math.abs(kgDelta) > 0.005;

  const nowCount = Number(count);
  const countValid = Number.isInteger(nowCount) && nowCount > 0;
  const countDelta = countValid ? nowCount - packages : 0;
  const countMoved = countValid && countDelta !== 0;

  return (
    <form action={action} className="space-y-4 rounded-lg border bg-card p-4">
      <input type="hidden" name="batchId" value={batchId} />
      <input type="hidden" name="shipmentId" value={shipmentId} />
      {/* Verifying is checking in. The only difference is the two figures it
          carries, and neither of them is a fault. */}
      <input type="hidden" name="outcome" value="RECEIVED" />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold">{t("What arrived in Dar")}</p>
        <p className="font-mono text-xs text-muted-foreground">{trackingNumber}</p>
      </div>

      <WeighFigures label="weight" was={String(weightKg)} unit="kg" delta={kgDelta} moved={kgMoved}>
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

      <WeighFigures
        label="boxes"
        was={String(packages)}
        unit="boxes"
        delta={countDelta}
        moved={countMoved}
      >
        <input
          name="packagesArrived"
          type="number"
          step="1"
          min="1"
          inputMode="numeric"
          value={count}
          onChange={(event) => setCount(event.target.value)}
          className={WEIGH_BOX}
          aria-label={t("Boxes counted in Dar")}
        />
      </WeighFigures>

      {/* Fewer boxes is a shortage, and the release counter has to know which
          cartons are actually on the floor — so the ones above the count are
          left unscanned rather than deleted. Said here so nobody presses OK
          expecting the consignment to go out whole. */}
      {countDelta < 0 ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          <span className="font-semibold">
            {Math.abs(countDelta)} {t("short.")}
          </span>{" "}
          {t(
            "The boxes that arrived go into the warehouse; release stays shut until the rest turn up."
          )}
        </p>
      ) : null}

      {/* Optional, always. Never a condition of saving a figure. */}
      {photo ? (
        <PhotoCapture
          name="photos"
          max={2}
          label="Photo (optional)"
          hint="Only if you want one on the record."
          durable={photosDurable}
        />
      ) : (
        <Button type="button" variant="ghost" size="sm" onClick={() => setPhoto(true)}>
          <Camera className="mr-1.5 h-4 w-4" />
          {t("Add a photo (optional)")}
        </Button>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <SubmitButton
          variant="brand"
          size="sm"
          disabled={!kgValid || !countValid}
          pendingLabel="Recording…"
        >
          <Check className="mr-1.5 h-4 w-4" />
          {t("OK — check it in")}
        </SubmitButton>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          {t("Cancel")}
        </Button>
      </div>
    </form>
  );
}
