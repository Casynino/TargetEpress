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
import { EXCEPTION_TYPE_LABELS, enumOptions } from "@/lib/constants";
import { formatWeight } from "@/lib/format";

type Row = {
  id: string;
  trackingNumber: string;
  customerName: string;
  customerPhone: string;
  packages: number;
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
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card p-4 shadow-soft">
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
          <p className="font-mono text-sm font-semibold tabular">
            {shipment.trackingNumber}
          </p>
          <p className="mt-0.5 text-sm">{shipment.customerName}</p>
          <p className="text-xs text-muted-foreground">
            {shipment.packages} pkg · {formatWeight(shipment.weightKg)} ·{" "}
            {shipment.description}
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

      {locked ? null : (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
          <form action={action}>
            <input type="hidden" name="batchId" value={batchId} />
            <input type="hidden" name="shipmentId" value={shipment.id} />
            <input type="hidden" name="result" value="VERIFIED" />
            <SubmitButton
              size="sm"
              variant={done ? "outline" : "brand"}
              pendingLabel="Checking…"
            >
              <Check className="mr-1.5 h-4 w-4" />
              {done ? "Checked" : "Present & correct"}
            </SubmitButton>
          </form>

          <button
            type="button"
            onClick={() => setFlagging((v) => !v)}
            className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm text-destructive hover:bg-destructive/5"
          >
            <AlertTriangle className="h-4 w-4" />
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
