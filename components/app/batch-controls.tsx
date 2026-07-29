"use client";

import { useActionState } from "react";
import type { BatchStatus, Role } from "@prisma/client";
import { Lock, Minus, Plane, Plus } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { departBatch, sealBatch, setShipmentBatch } from "@/lib/actions/batches";
import type { ActionResult } from "@/lib/actions/types";
import { AIRLINE_SUGGESTIONS } from "@/lib/constants";
import { can } from "@/lib/rbac";
import { formatWeight } from "@/lib/format";

type Props = {
  batchId: string;
  batchNumber: string;
  status: BatchStatus;
  role: Role;
  shipmentCount: number;
  unassigned: {
    id: string;
    trackingNumber: string;
    customerName: string;
    packages: number;
    weightKg: number;
  }[];
  loaded: { id: string; trackingNumber: string }[];
};

export function BatchControls(props: Props) {
  const manageable = can(props.role, "batch.manage");
  const canDepart = can(props.role, "shipment.depart");

  return (
    <div className="space-y-6">
      {manageable && props.status === "OPEN" ? (
        <>
          <AddCargoPanel batchId={props.batchId} unassigned={props.unassigned} />
          <RemoveCargoPanel loaded={props.loaded} />
          <SealPanel batchId={props.batchId} shipmentCount={props.shipmentCount} />
        </>
      ) : null}

      {canDepart && props.status === "READY_TO_DEPART" ? (
        <DeparturePanel batchId={props.batchId} />
      ) : null}

      {props.status === "IN_TRANSIT" ? (
        <p className="rounded-xl border bg-info/5 p-5 text-sm text-info">
          This batch is in the air. The Dar warehouse will receive it on arrival.
        </p>
      ) : null}
    </div>
  );
}

function AddCargoPanel({
  batchId,
  unassigned,
}: {
  batchId: string;
  unassigned: Props["unassigned"];
}) {
  const [state, action] = useActionState<ActionResult, FormData>(
    setShipmentBatch,
    { ok: true }
  );

  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <h2 className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
        <Plus className="h-4 w-4 text-brand" />
        Add cargo
      </h2>

      {unassigned.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">
          All registered cargo is already assigned to a batch.
        </p>
      ) : (
        <ul className="max-h-80 divide-y overflow-y-auto">
          {unassigned.map((shipment) => (
            <li key={shipment.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-sm tabular">
                  {shipment.trackingNumber}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {shipment.customerName} · {shipment.packages} pkg ·{" "}
                  {formatWeight(shipment.weightKg)}
                </p>
              </div>
              <form action={action}>
                <input type="hidden" name="shipmentId" value={shipment.id} />
                <input type="hidden" name="batchId" value={batchId} />
                <SubmitButton size="sm" variant="outline" pendingLabel="Adding…">
                  Add
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}

      <div className="px-5 pb-4">
        <FormError state={state} />
      </div>
    </section>
  );
}

function RemoveCargoPanel({ loaded }: { loaded: Props["loaded"] }) {
  const [state, action] = useActionState<ActionResult, FormData>(
    setShipmentBatch,
    { ok: true }
  );

  if (loaded.length === 0) return null;

  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <h2 className="flex items-center gap-2 border-b px-5 py-3.5 text-sm font-semibold">
        <Minus className="h-4 w-4 text-muted-foreground" />
        Remove cargo
      </h2>
      <ul className="max-h-60 divide-y overflow-y-auto">
        {loaded.map((shipment) => (
          <li key={shipment.id} className="flex items-center gap-3 px-5 py-2.5">
            <span className="flex-1 font-mono text-sm tabular">
              {shipment.trackingNumber}
            </span>
            <form action={action}>
              <input type="hidden" name="shipmentId" value={shipment.id} />
              <input type="hidden" name="batchId" value="" />
              <SubmitButton size="sm" variant="ghost" pendingLabel="…">
                Remove
              </SubmitButton>
            </form>
          </li>
        ))}
      </ul>
      <div className="px-5 pb-4">
        <FormError state={state} />
      </div>
    </section>
  );
}

function SealPanel({
  batchId,
  shipmentCount,
}: {
  batchId: string;
  shipmentCount: number;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(sealBatch, {
    ok: true,
  });

  return (
    <section className="rounded-xl border bg-card p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Lock className="h-4 w-4 text-warning" />
        Seal the batch
      </h2>
      <p className="mt-1.5 text-xs text-muted-foreground">
        Sealing stops any more cargo being added. Do it once the batch is
        physically closed and ready for the airport.
      </p>
      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="batchId" value={batchId} />
        <FormError state={state} />
        <SubmitButton
          variant="brand"
          size="sm"
          disabled={shipmentCount === 0}
          pendingLabel="Sealing…"
        >
          Seal batch
        </SubmitButton>
      </form>
    </section>
  );
}

function DeparturePanel({ batchId }: { batchId: string }) {
  const [state, action] = useActionState<ActionResult, FormData>(departBatch, {
    ok: true,
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <section className="rounded-xl border bg-card p-5 shadow-soft">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Plane className="h-4 w-4 text-brand" />
        Record departure
      </h2>
      <p className="mt-1.5 text-xs text-muted-foreground">
        This moves every shipment in the batch to “In transit” and makes the
        flight visible to the whole company.
      </p>

      <form action={action} className="mt-4 space-y-3">
        <input type="hidden" name="batchId" value={batchId} />

        <div className="space-y-1.5">
          <Label htmlFor="airline" className="text-xs">
            Airline
          </Label>
          <Input id="airline" name="airline" list="airlines" required />
          <datalist id="airlines">
            {AIRLINE_SUGGESTIONS.map((a) => (
              <option key={a} value={a} />
            ))}
          </datalist>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="flightNumber" className="text-xs">
              Flight number
            </Label>
            <Input
              id="flightNumber"
              name="flightNumber"
              placeholder="ET 8611"
              className="uppercase"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="departureDate" className="text-xs">
              Departure date
            </Label>
            <Input
              id="departureDate"
              name="departureDate"
              type="date"
              defaultValue={today}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="waybillNumber" className="text-xs">
            Waybill number
          </Label>
          <Input id="waybillNumber" name="waybillNumber" required />
        </div>

        <FormError state={state} />
        <SubmitButton variant="brand" size="sm" pendingLabel="Recording…">
          Mark as departed
        </SubmitButton>
      </form>
    </section>
  );
}
