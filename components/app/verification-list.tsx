"use client";

import { useActionState, useState } from "react";
import type { BatchStatus, ShipmentStatus } from "@prisma/client";
import { AlertTriangle, Check, CheckCheck } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { completeVerification, verifyShipment } from "@/lib/actions/batches";
import type { ActionResult } from "@/lib/actions/types";
import {
  EXCEPTION_TYPE_LABELS,
  PACKAGE_TYPE_LABELS,
  enumOptions,
  formatPackages,
} from "@/lib/constants";
import { formatWeight } from "@/lib/format";

type Row = {
  id: string;
  trackingNumber: string;
  customerName: string;
  customerPhone: string | null;
  packages: number;
  packageType: string;
  packageList: { id: string; sequence: number; received: boolean }[];
  weightKg: number;
  description: string;
  status: ShipmentStatus;
  verification: { result: string; note: string | null } | null;
};

/**
 * The arrival checklist. One row per shipment on the manifest; each is either
 * ticked off or flagged. Nothing here bulk-approves — the whole point is that
 * a human confirmed each box is physically present.
 */
export function VerificationList({
  batchId,
  batchStatus,
  shipments,
}: {
  batchId: string;
  batchStatus: BatchStatus;
  shipments: Row[];
}) {
  const checked = shipments.filter((s) => s.verification).length;
  const flagged = shipments.filter(
    (s) => s.verification?.result === "EXCEPTION"
  ).length;
  const remaining = shipments.length - checked;

  return (
    <div className="space-y-4">
      <div className="sticky top-14 z-20 flex flex-wrap items-center gap-3 rounded-xl border bg-card/95 p-4 shadow-soft backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:static sm:bg-card sm:backdrop-blur-none">
        <div className="flex-1">
          <p className="text-sm font-medium">
            {checked} of {shipments.length} checked
            {flagged > 0 ? ` · ${flagged} flagged` : ""}
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-brand transition-all"
              style={{
                width: `${shipments.length ? (checked / shipments.length) * 100 : 0}%`,
              }}
            />
          </div>
        </div>
        {batchStatus === "ARRIVED" ? (
          <CompleteButton batchId={batchId} disabled={remaining > 0} />
        ) : null}
      </div>

      <ul className="space-y-3">
        {shipments.map((shipment) => (
          <VerificationRow
            key={shipment.id}
            batchId={batchId}
            shipment={shipment}
            locked={batchStatus !== "ARRIVED"}
          />
        ))}
      </ul>
    </div>
  );
}

function VerificationRow({
  batchId,
  shipment,
  locked,
}: {
  batchId: string;
  shipment: Row;
  locked: boolean;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    verifyShipment,
    { ok: true }
  );
  const [flagging, setFlagging] = useState(false);
  // Everything is assumed present — the common case is a complete shipment, and
  // the operator only has to act when something is missing.
  const [present, setPresent] = useState<string[]>(
    shipment.packageList.map((pkg) => pkg.id)
  );
  const unit =
    PACKAGE_TYPE_LABELS[shipment.packageType] ?? PACKAGE_TYPE_LABELS.PACKAGE;

  const done = shipment.verification?.result === "VERIFIED";
  const flagged = shipment.verification?.result === "EXCEPTION";

  return (
    <li
      className={`rounded-xl border bg-card p-4 shadow-soft ${
        done ? "border-success/40" : flagged ? "border-destructive/40" : ""
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-base font-bold tabular sm:text-sm">
            {shipment.trackingNumber}
          </p>
          <p className="mt-0.5 text-sm font-medium">{shipment.customerName}</p>
          <p className="text-xs text-muted-foreground">
            {formatPackages(shipment.packages, shipment.packageType)} ·{" "}
            {formatWeight(shipment.weightKg)} · {shipment.description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {done ? <Badge variant="success">Checked in</Badge> : null}
          {flagged ? <Badge variant="destructive">Exception</Badge> : null}
          <ShipmentStatusBadge status={shipment.status} />
        </div>
      </div>

      {shipment.verification?.note ? (
        <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          {shipment.verification.note}
        </p>
      ) : null}

      {/* Every box, individually. Untick one and the shipment is recorded short
          — which is the whole reason each package carries its own QR. */}
      {!locked && shipment.packageList.length > 1 ? (
        <div className="mt-3 border-t pt-3">
          <p className="text-xs text-muted-foreground">
            Tick each {unit.one} that is physically here
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {shipment.packageList.map((pkg) => {
              const on = present.includes(pkg.id);
              return (
                <button
                  key={pkg.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    setPresent((current) =>
                      current.includes(pkg.id)
                        ? current.filter((id) => id !== pkg.id)
                        : [...current, pkg.id]
                    )
                  }
                  className={`inline-flex h-10 min-w-10 items-center justify-center rounded-md border px-3 text-sm font-semibold tabular transition-colors ${
                    on
                      ? "border-brand bg-brand/10 text-brand"
                      : "border-dashed text-muted-foreground"
                  }`}
                >
                  {pkg.sequence}
                </button>
              );
            })}
          </div>
          {present.length < shipment.packageList.length ? (
            <p className="mt-2 text-xs text-warning">
              {shipment.packageList.length - present.length} of{" "}
              {shipment.packageList.length} not here — checking in will raise a
              shortage and block release until they arrive.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Full-width and 48px tall on a phone: these are pressed with a thumb,
          one-handed, while the other hand holds the carton. On a desk they
          shrink back to a normal inline pair. */}
      {locked ? null : (
        <div className="mt-4 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:flex-wrap sm:items-center">
          <form action={action} className="w-full sm:w-auto">
            <input type="hidden" name="batchId" value={batchId} />
            <input type="hidden" name="shipmentId" value={shipment.id} />
            <input type="hidden" name="result" value="VERIFIED" />
            <input type="hidden" name="packageSelection" value="explicit" />
            {shipment.packageList.map((pkg) => (
              <input
                key={pkg.id}
                type="hidden"
                name="packageIds"
                value={present.includes(pkg.id) ? pkg.id : ""}
              />
            ))}
            <SubmitButton
              variant={done ? "outline" : "brand"}
              pendingLabel="Checking…"
              className="h-12 w-full text-base sm:h-9 sm:w-auto sm:text-sm"
            >
              <Check className="mr-1.5 h-5 w-5 sm:h-4 sm:w-4" />
              {done
                ? "Checked"
                : present.length === shipment.packageList.length
                  ? "Present & correct"
                  : `Check in ${present.length} of ${shipment.packageList.length}`}
            </SubmitButton>
          </form>

          <button
            type="button"
            onClick={() => setFlagging((v) => !v)}
            className="inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-md border text-base text-destructive hover:bg-destructive/5 sm:h-9 sm:w-auto sm:px-3 sm:text-sm"
          >
            <AlertTriangle className="h-5 w-5 sm:h-4 sm:w-4" />
            Flag a problem
          </button>
        </div>
      )}

      {flagging && !locked ? (
        <form action={action} className="mt-3 space-y-3 rounded-lg border p-3">
          <input type="hidden" name="batchId" value={batchId} />
          <input type="hidden" name="shipmentId" value={shipment.id} />
          <input type="hidden" name="result" value="EXCEPTION" />

          <div className="space-y-1.5">
            <Label htmlFor={`type-${shipment.id}`} className="text-xs">
              What is wrong?
            </Label>
            <NativeSelect
              id={`type-${shipment.id}`}
              name="exceptionType"
              defaultValue="MISSING_SHIPMENT"
            >
              {enumOptions(EXCEPTION_TYPE_LABELS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`note-${shipment.id}`} className="text-xs">
              Details
            </Label>
            <Input
              id={`note-${shipment.id}`}
              name="note"
              placeholder="e.g. 3 of 4 cartons arrived, one carton torn open"
              required
            />
          </div>

          <SubmitButton size="sm" variant="destructive" pendingLabel="Flagging…">
            Record exception
          </SubmitButton>
        </form>
      ) : null}

      <div className="mt-2">
        <FormError state={state} />
      </div>
    </li>
  );
}

function CompleteButton({
  batchId,
  disabled,
}: {
  batchId: string;
  disabled: boolean;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    completeVerification,
    { ok: true }
  );

  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <SubmitButton
        variant="brand"
        size="sm"
        disabled={disabled}
        pendingLabel="Closing…"
      >
        <CheckCheck className="mr-1.5 h-4 w-4" />
        Finish check-in
      </SubmitButton>
      <FormError state={state} />
    </form>
  );
}
