"use client";

import { useState } from "react";
import { Camera, PackageCheck } from "lucide-react";

import { SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { PhotoCapture } from "@/components/app/photo-capture";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

/**
 * THE COUNT DAR MADE.
 *
 * China writes a packing list; Dar puts the cargo on a scale and counts what
 * is on the pallet. They disagree constantly — the tape, the pallet, a
 * mistyped digit — and this is where the floor says what is really here.
 *
 * WHAT CHINA SAID IS PRINTED BESIDE EACH FIELD AND NEVER TYPED INTO IT. A
 * pre-filled count is a count nobody made: the clerk who agrees presses the
 * tick on the row and this dialog is never opened, so anybody who does open it
 * is here to say something different. Leaving a box empty leaves Guangzhou's
 * figure standing, which is the honest reading of having typed nothing.
 *
 * It sits on the ORDINARY path, beside the tick, not behind the ⚠. Correcting
 * a weight is not a problem with the cargo and the owner was explicit that it
 * must not force anybody to open a case: no reason, no claim, no mandatory
 * photograph. Weigh · count · condition · confirm.
 *
 * Written before the cargo is priced, so the bill is struck on these figures —
 * which is what "priced at Dar check-in" was always supposed to mean.
 */
const CONDITIONS = [
  { value: "GOOD", label: "Good" },
  { value: "MINOR_DAMAGE", label: "Minor damage" },
  { value: "DAMAGED", label: "Damaged" },
  { value: "WET", label: "Wet" },
  { value: "REPACKED", label: "Repacked" },
] as const;

export type ChinaFigures = {
  packages: number;
  pieces: number | null;
  weightKg: number;
  volumeCbm: number | null;
};

export function VerifyPanel({
  batchId,
  shipmentId,
  trackingNumber,
  customerName,
  packages,
  chinaSaid,
  condition,
  shelfLocation,
  photosDurable,
  action,
  onDone,
}: {
  batchId: string;
  shipmentId: string;
  trackingNumber: string;
  /** On the dialog's own line, so a clerk knows whose cargo they are counting. */
  customerName: string;
  /** Boxes on the manifest now — what a short count is measured against. */
  packages: number;
  /** What Guangzhou declared, printed beside each field. */
  chinaSaid: ChinaFigures;
  /** What the floor has already said about this cargo, if anything. */
  condition: string | null;
  shelfLocation: string | null;
  photosDurable: boolean;
  action: (formData: FormData) => void;
  onDone: () => void;
}) {
  const t = useT();
  const [count, setCount] = useState("");
  const [photo, setPhoto] = useState(false);

  const nowCount = Number(count);
  const countValid = count !== "" && Number.isInteger(nowCount) && nowCount > 0;
  const short = countValid ? nowCount - packages : 0;

  /* China's figure, said the same way under every label. Omitted rather than
     printed as a dash when Guangzhou left it blank — there is nothing to
     compare against and a "China said —" reads as a figure of zero. */
  const said = (value: number | null, digits = 0) =>
    value === null ? null : (
      <span className="ml-1.5 font-normal text-muted-foreground">
        {t("China said")} {digits ? value.toFixed(digits) : value}
      </span>
    );

  return (
    <Dialog open onOpenChange={(next) => (next ? null : onDone())}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            <span className="font-mono">{trackingNumber}</span>
            <span className="text-muted-foreground"> — </span>
            {t("the count Dar made")}
          </DialogTitle>
          <DialogDescription>{customerName}</DialogDescription>
        </DialogHeader>

        <form action={action} className="space-y-4">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="shipmentId" value={shipmentId} />
          {/* Counting is checking in. The figures it carries are not a fault
              and open nothing. */}
          <input type="hidden" name="outcome" value="RECEIVED" />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="condition" className="text-xs">
                {t("Condition")}
              </Label>
              <NativeSelect
                id="condition"
                name="condition"
                defaultValue={condition ?? "GOOD"}
              >
                {CONDITIONS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {t(item.label)}
                  </option>
                ))}
              </NativeSelect>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="shelfLocation" className="text-xs">
                {t("Shelf / location")}
              </Label>
              <Input
                id="shelfLocation"
                name="shelfLocation"
                defaultValue={shelfLocation ?? ""}
                placeholder={t("Bay 3, top shelf")}
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="packagesArrived" className="text-xs">
                {t("Packages counted")}
                {said(chinaSaid.packages)}
              </Label>
              <Input
                id="packagesArrived"
                name="packagesArrived"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={count}
                onChange={(event) => setCount(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="pieces" className="text-xs">
                {t("Pieces")}
                {said(chinaSaid.pieces)}
              </Label>
              <Input
                id="pieces"
                name="pieces"
                type="number"
                min="0"
                step="1"
                inputMode="numeric"
                autoComplete="off"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="weightKg" className="text-xs">
                {t("Weight (kg)")}
                {said(chinaSaid.weightKg, 2)}
              </Label>
              <Input
                id="weightKg"
                name="weightKg"
                type="number"
                min="0"
                step="0.001"
                inputMode="decimal"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="volumeCbm" className="text-xs">
                {t("Volume (CBM)")}
                {said(chinaSaid.volumeCbm, 3)}
              </Label>
              <Input
                id="volumeCbm"
                name="volumeCbm"
                type="number"
                min="0"
                step="0.0001"
                inputMode="decimal"
              />
            </div>
          </div>

          {/* Fewer boxes is a shortage, and the release counter has to know
              which cartons are actually on the floor — so the ones above the
              count are left unscanned rather than deleted. Said here so nobody
              confirms expecting the consignment to go out whole. */}
          {short < 0 ? (
            <p className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
              <span className="font-semibold">
                {Math.abs(short)} {t("short.")}
              </span>{" "}
              {t(
                "The boxes that arrived go into the warehouse; release stays shut until the rest turn up.",
              )}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="note" className="text-xs">
              {t("Notes")}
            </Label>
            <Textarea id="note" name="note" rows={2} />
          </div>

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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setPhoto(true)}
            >
              <Camera className="mr-1.5 h-4 w-4" />
              {t("Add a photo (optional)")}
            </Button>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <SubmitButton variant="brand" pendingLabel="Recording…">
              <PackageCheck className="mr-1.5 h-4 w-4" />
              {t("Confirm received at Dar")}
            </SubmitButton>
            <Button type="button" variant="ghost" size="sm" onClick={onDone}>
              {t("Cancel")}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
