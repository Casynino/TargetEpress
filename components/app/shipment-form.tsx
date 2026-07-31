"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import type { CargoCategory } from "@prisma/client";
import { CheckCircle2, Info, Plane } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { PhotoCapture } from "@/components/app/photo-capture";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createShipment } from "@/lib/actions/shipments";
import type { ActionResult } from "@/lib/actions/types";
import {
  AIRPORT_LABELS,
  CATEGORY_EXAMPLES,
  CATEGORY_LABELS,
  ROUTE_FOR_CATEGORY,
} from "@/lib/cargo";
import { CustomerPicker } from "@/components/app/customer-picker";

const CATEGORIES: CargoCategory[] = [
  "NORMAL_GOODS",
  "ELECTRONICS",
  "LIQUID_SPECIAL",
];

type OpenBatch = {
  id: string;
  batchNumber: string;
  origin: "GUANGZHOU" | "HONG_KONG";
};

type CargoTypeOption = { id: string; name: string };


/**
 * Cargo registration, for the warehouse.
 *
 * What this form deliberately does NOT ask for:
 *  - a price, or any rate. Warehouse staff record what arrived; Finance prices
 *    it. A rate box here would put pricing in the hands of whoever is holding
 *    the scale.
 *  - the departure airport. It is derived from the cargo category and shown
 *    read-only, so cargo cannot be sent to the wrong hub by a mis-click.
 */
export function ShipmentForm({
  openBatches,
  typesByCategory,
  photosDurable,
}: {
  openBatches: OpenBatch[];
  typesByCategory: Record<string, CargoTypeOption[]>;
  photosDurable: boolean;
}) {
  const [state, formAction] = useActionState<
    ActionResult<{ trackingNumber: string }>,
    FormData
  >(createShipment, { ok: true });

  const [category, setCategory] = useState<CargoCategory>("NORMAL_GOODS");
  const [cargoTypeId, setCargoTypeId] = useState("");
  const [batchId, setBatchId] = useState("");

  const route = ROUTE_FOR_CATEGORY[category];
  const types = typesByCategory[category] ?? [];
  // Only batches leaving the airport this cargo flies from can accept it.
  const eligibleBatches = openBatches.filter((b) => b.origin === route);

  // Changing category can invalidate the chosen batch and cargo type.
  useEffect(() => {
    setCargoTypeId("");
    setBatchId((current) =>
      eligibleBatches.some((b) => b.id === current) ? current : ""
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const created = state.ok && state.data?.trackingNumber;

  if (created) {
    return (
      <div className="panel p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 animate-success-pop text-success" />
        <h2 className="mt-4 font-display text-xl font-bold">Shipment registered</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Print the label and attach it to the cargo now.
        </p>
        <p className="mt-4 font-mono text-2xl font-bold tabular">{created}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href={`/app/shipments/${created}/label`}
            className="inline-flex h-10 items-center rounded-md bg-signal px-4 text-sm font-medium text-signal-foreground hover:bg-signal/90"
          >
            Print QR label
          </Link>
          <Link
            href={`/app/shipments/${created}`}
            className="inline-flex h-10 items-center rounded-md border px-4 text-sm hover:bg-muted"
          >
            View shipment
          </Link>
          <a
            href="/app/shipments/new"
            className="inline-flex h-10 items-center rounded-md border px-4 text-sm hover:bg-muted"
          >
            Register another
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* 1. Customer */}
      <section className="panel p-6">
        <h2 className="font-display font-semibold">1. Customer</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Find them if we have shipped for them before. If not, record them once
          and they are in the book from then on.
        </p>

        <div className="mt-5">
          <CustomerPicker />
        </div>
      </section>

      {/* 2. What the cargo is */}
      <section className="panel p-6">
        <h2 className="font-display font-semibold">2. What is the cargo?</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          This is the only classification you make. The system works out the
          airport and the price from it.
        </p>

        <fieldset className="mt-5 grid gap-2">
          <legend className="sr-only">Cargo category</legend>
          {CATEGORIES.map((option) => {
            const active = category === option;
            return (
              <label
                key={option}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors ${
                  active ? "border-signal bg-signal/5" : "hover:bg-muted/50"
                }`}
              >
                <input
                  type="radio"
                  name="cargoCategory"
                  value={option}
                  checked={active}
                  onChange={() => setCategory(option)}
                  className="mt-1 h-4 w-4 shrink-0 accent-[hsl(var(--signal))]"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {CATEGORY_LABELS[option]}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {CATEGORY_EXAMPLES[option]}
                  </span>
                </span>
              </label>
            );
          })}
        </fieldset>

        {/* Derived airport — read-only, so the rule is visible but not editable */}
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/5 p-3">
          <Plane className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <div className="text-xs">
            <p className="font-medium">
              Departs {AIRPORT_LABELS[route]}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              Chosen automatically from the cargo category — you do not set this.
            </p>
          </div>
        </div>

        {types.length > 0 ? (
          <div className="mt-5 space-y-2">
            <Label htmlFor="cargoTypeId">
              Which item?{" "}
              <span className="font-normal text-muted-foreground">
                helps Finance price it correctly
              </span>
            </Label>
            <NativeSelect
              id="cargoTypeId"
              name="cargoTypeId"
              value={cargoTypeId}
              onChange={(e) => setCargoTypeId(e.target.value)}
            >
              <option value="">Not listed / mixed</option>
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </NativeSelect>
            {category === "ELECTRONICS" && !cargoTypeId ? (
              <p className="flex items-start gap-1.5 text-xs text-warning">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Electronics are priced per item. Without an item, Finance will
                have to price this one by hand.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 space-y-2">
          <Label htmlFor="description">Description</Label>
          <Input
            id="description"
            name="description"
            placeholder="What is actually in the boxes"
            autoComplete="off"
            required
          />
          <p className="text-xs text-muted-foreground">
            Your own words. This is what the customer sees when they track, and
            what appears on the invoice.
          </p>
        </div>
      </section>

      {/* 3. Weigh and count */}
      <section className="panel p-6">
        <h2 className="font-display font-semibold">3. Weigh and count</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Weigh before you record. This weight is what the customer is billed on,
          so it has to be right.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="weightKg">Weight (kg)</Label>
            <Input
              id="weightKg"
              name="weightKg"
              type="number"
              min="0.01"
              step="0.001"
              inputMode="decimal"
              placeholder="0.000"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="packages">Packages</Label>
            <Input
              id="packages"
              name="packages"
              type="number"
              min="1"
              step="1"
              defaultValue="1"
              inputMode="numeric"
              required
            />
          </div>
        </div>
      </section>

      {/* 4. Photograph */}
      <section className="panel p-6">
        <h2 className="font-display font-semibold">
          4. Photograph the cargo <span className="text-signal">*</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Required. This is the proof of what we received and the condition it
          arrived in — it settles disputes months later.
        </p>
        <div className="mt-5">
          <PhotoCapture
            name="photos"
            required
            max={4}
            label="Receiving photos"
            hint="One is enough, but photograph any damage separately."
            durable={photosDurable}
          />
        </div>
      </section>

      {/* 5. Batch and notes */}
      <section className="panel p-6">
        <h2 className="font-display font-semibold">5. Batch &amp; notes</h2>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="batchId">Add to batch</Label>
            <NativeSelect
              id="batchId"
              name="batchId"
              value={batchId}
              onChange={(e) => setBatchId(e.target.value)}
            >
              <option value="">Not yet — assign later</option>
              {eligibleBatches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.batchNumber}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              {eligibleBatches.length === 0 ? (
                <>
                  No open batch departing {AIRPORT_LABELS[route]}.{" "}
                  <Link href="/app/batches/new" className="underline">
                    Open one
                  </Link>
                  .
                </>
              ) : (
                <>Only batches leaving {AIRPORT_LABELS[route]} are listed.</>
              )}
            </p>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="internalNotes">
              Internal notes{" "}
              <span className="font-normal text-muted-foreground">
                never shown to the customer
              </span>
            </Label>
            <Textarea
              id="internalNotes"
              name="internalNotes"
              rows={3}
              placeholder="Supplier name, carton markings, anything the Dar team should know."
            />
          </div>
        </div>
      </section>

      <FormError state={state} />

      <div className="flex flex-wrap gap-3">
        <SubmitButton variant="signal" pendingLabel="Registering…">
          Register shipment
        </SubmitButton>
        <Link
          href="/app/shipments"
          className="inline-flex h-10 items-center rounded-md border px-4 text-sm hover:bg-muted"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
