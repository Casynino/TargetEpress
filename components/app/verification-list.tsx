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
import {
  completeVerification,
  verifyBatchAll,
  verifyShipment,
} from "@/lib/actions/batches";
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
 * The arrival checklist.
 *
 * Built around what actually happens: a flight arrives intact almost every
 * time. Loss and damage are real but rare, so the screen is shaped for the
 * common case — one button accepts the whole manifest — and the per-shipment
 * controls exist for the handful that need flagging.
 *
 * It used to demand eighty-seven individual confirmations to record "the
 * flight was fine", which is the same information at eighty-seven times the
 * cost, and a checklist that expensive gets clicked through without being read.
 *
 * Accepting in bulk deliberately skips any shipment that already has a
 * verification, so pressing it cannot wipe an exception somebody raised.
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
          <div className="flex flex-wrap items-center gap-2">
            {remaining > 0 ? (
              <AcceptAllButton batchId={batchId} remaining={remaining} />
            ) : null}
            <CompleteButton batchId={batchId} disabled={remaining > 0} />
          </div>
        ) : null}
      </div>

      {batchStatus === "ARRIVED" && remaining > 0 ? (
        <p className="text-xs text-muted-foreground">
          Everything normally arrives as sent. Accept the whole manifest, then
          flag only what is missing or damaged.
        </p>
      ) : null}

      <ul className="space-y-1.5">
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

/**
 * Accept everything still unruled on.
 *
 * Sized and coloured as the primary action because it is the one taken almost
 * every time. The count is in the label so nobody presses it without seeing
 * how many lines it covers.
 */
function AcceptAllButton({
  batchId,
  remaining,
}: {
  batchId: string;
  remaining: number;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    verifyBatchAll,
    { ok: true }
  );

  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="batchId" value={batchId} />
      <SubmitButton variant="signal" className="rounded-lg" size="sm">
        <CheckCheck className="mr-2 h-4 w-4" />
        All {remaining} present &amp; undamaged
      </SubmitButton>
      <FormError state={state} />
    </form>
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
    // One line per shipment rather than a card each. Eighty-seven cards is a
    // page nobody reads to the bottom of; eighty-seven rows can be scanned for
    // the one that looks wrong, which is the only thing anybody is looking for.
    <li
      className={`rounded-lg border bg-card px-3 py-2.5 ${
        done
          ? "border-success/30 bg-success/[0.03]"
          : flagged
            ? "border-destructive/40"
            : ""
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {done ? (
            <Check className="h-4 w-4 shrink-0 text-success" />
          ) : flagged ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          ) : (
            <span className="h-4 w-4 shrink-0 rounded-full border border-dashed" />
          )}
          <p className="shrink-0 font-mono text-sm font-semibold tabular">
            {shipment.trackingNumber}
          </p>
          <p className="shrink-0 text-sm">{shipment.customerName}</p>
          <p className="truncate text-xs text-muted-foreground">
            {formatPackages(shipment.packages, shipment.packageType)} ·{" "}
            {formatWeight(shipment.weightKg)} · {shipment.description}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {flagged ? <Badge variant="destructive">Exception</Badge> : null}
          {!done && !flagged ? (
            <ShipmentStatusBadge status={shipment.status} />
          ) : null}
        </div>
      </div>

      {shipment.verification?.note ? (
        <p className="mt-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
          {shipment.verification.note}
        </p>
      ) : null}

      {/* The default row is two buttons: it was fine, or it was not.
          Everything about which boxes are where lives behind "Something is
          wrong", because in the normal case there is nothing to say. */}
      {locked ? null : (
        <div className="mt-3 flex flex-col gap-2 border-t pt-3 sm:flex-row sm:flex-wrap sm:items-center">
          <form action={action} className="w-full sm:w-auto">
            <input type="hidden" name="batchId" value={batchId} />
            <input type="hidden" name="shipmentId" value={shipment.id} />
            <input type="hidden" name="result" value="VERIFIED" />
            <SubmitButton
              variant={done ? "outline" : "brand"}
              pendingLabel="Checking…"
              className="h-12 w-full text-base sm:h-9 sm:w-auto sm:text-sm"
            >
              <Check className="mr-1.5 h-5 w-5 sm:h-4 sm:w-4" />
              {done ? "Checked" : "Present & correct"}
            </SubmitButton>
          </form>

          <button
            type="button"
            onClick={() => setFlagging((v) => !v)}
            className="inline-flex h-12 w-full items-center justify-center gap-1.5 rounded-md border text-base text-destructive hover:bg-destructive/5 sm:h-9 sm:w-auto sm:px-3 sm:text-sm"
          >
            <AlertTriangle className="h-5 w-5 sm:h-4 sm:w-4" />
            {flagging ? "Never mind" : "Something is wrong"}
          </button>
        </div>
      )}


      {flagging && !locked ? (
        <div className="mt-3 space-y-4 rounded-lg border border-destructive/30 bg-destructive/[0.03] p-3">
          {/* PATH 1 — some boxes short.
              Only for multi-package shipments: a single-package shipment is
              either here or it is not, and "1 of 1 missing" is the whole
              shipment, which is the other path. */}
          {shipment.packageList.length > 1 ? (
            <div>
              <p className="text-xs font-medium">
                Which {unit.many} are on the floor?
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Untick anything that did not arrive.
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

              <form action={action} className="mt-3">
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
                  variant="brand"
                  pendingLabel="Recording…"
                  className="h-11 w-full text-sm sm:w-auto"
                  disabled={present.length === shipment.packageList.length}
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  Check in {present.length} of {shipment.packageList.length}
                </SubmitButton>
                {present.length < shipment.packageList.length ? (
                  <p className="mt-2 text-xs text-warning">
                    {shipment.packageList.length - present.length} missing —
                    this raises a shortage and blocks release until they arrive.
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Untick a {unit.one} above to record it short.
                  </p>
                )}
              </form>

              <div className="mt-4 border-t pt-3 text-xs font-medium">
                Or the cargo is damaged / wrong
              </div>
            </div>
          ) : null}

          {/* PATH 2 — damaged, wrong, or the whole shipment absent. */}
          <form action={action} className="space-y-3">
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
        </div>
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
