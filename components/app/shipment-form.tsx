"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { CheckCircle2, UserCheck } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createShipment } from "@/lib/actions/shipments";
import type { ActionResult } from "@/lib/actions/types";
import {
  DESCRIPTION_SUGGESTIONS,
  GOODS_TYPE_LABELS,
  ORIGIN_LABELS,
  TZ_CITIES,
  enumOptions,
} from "@/lib/constants";

type OpenBatch = { id: string; batchNumber: string; origin: string };

type KnownCustomer = {
  code: string;
  name: string;
  city: string | null;
} | null;

export function ShipmentForm({
  openBatches,
  defaultRate,
}: {
  openBatches: OpenBatch[];
  defaultRate: string;
}) {
  const [state, formAction] = useActionState<
    ActionResult<{ trackingNumber: string }>,
    FormData
  >(createShipment, { ok: true });

  const [phone, setPhone] = useState("");
  const [known, setKnown] = useState<KnownCustomer>(null);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");

  // Look the customer up as the number is typed — the desk should never have
  // to retype a name it has already captured once.
  useEffect(() => {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 9) {
      setKnown(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/customers/lookup?phone=${encodeURIComponent(phone)}`,
          { signal: controller.signal }
        );
        if (!res.ok) return;
        const data = (await res.json()) as { customer: KnownCustomer };
        setKnown(data.customer);
        if (data.customer) {
          setName(data.customer.name);
          setCity(data.customer.city ?? "");
        }
      } catch {
        // Aborted or offline — the form still works, staff just type the name.
      }
    }, 350);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [phone]);

  const created = state.ok && state.data?.trackingNumber;

  if (created) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center shadow-soft">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success" />
        <h2 className="mt-4 font-display text-xl font-bold">Shipment registered</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Print the label and attach it to the cargo now.
        </p>
        <p className="mt-4 font-mono text-2xl font-bold tabular">{created}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href={`/app/shipments/${created}/label`}
            className="inline-flex h-10 items-center rounded-md bg-brand px-4 text-sm font-medium text-brand-foreground hover:bg-brand/90"
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
    <form action={formAction} className="space-y-8">
      {/* Customer */}
      <section className="rounded-xl border bg-card p-6 shadow-soft">
        <h2 className="font-display font-semibold">Customer</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          The phone number is the customer&apos;s identity. Enter it first.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="customerPhone">Phone number</Label>
            <Input
              id="customerPhone"
              name="customerPhone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0762 000 111"
              inputMode="tel"
              autoComplete="off"
              required
            />
            {known ? (
              <p className="flex items-center gap-1.5 text-xs text-success">
                <UserCheck className="h-3.5 w-3.5" />
                Existing customer {known.code}
              </p>
            ) : phone.replace(/\D/g, "").length >= 9 ? (
              <p className="text-xs text-muted-foreground">
                New customer — a code will be created.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerName">Customer name</Label>
            <Input
              id="customerName"
              name="customerName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Business or trader name"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="customerCity">City in Tanzania</Label>
            <Input
              id="customerCity"
              name="customerCity"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              list="tz-cities"
              placeholder="Dar es Salaam"
            />
            <datalist id="tz-cities">
              {TZ_CITIES.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
        </div>
      </section>

      {/* Cargo */}
      <section className="rounded-xl border bg-card p-6 shadow-soft">
        <h2 className="font-display font-semibold">Cargo</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Weigh before you record. This weight is what the customer is billed on.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="goodsType">Goods type</Label>
            <NativeSelect id="goodsType" name="goodsType" defaultValue="GENERAL_MERCHANDISE" required>
              {enumOptions(GOODS_TYPE_LABELS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="origin">Origin</Label>
            <NativeSelect id="origin" name="origin" defaultValue="GUANGZHOU" required>
              {enumOptions(ORIGIN_LABELS).map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              name="description"
              list="cargo-descriptions"
              placeholder="Assorted general goods"
              required
            />
            <datalist id="cargo-descriptions">
              {DESCRIPTION_SUGGESTIONS.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </div>

          <div className="space-y-2">
            <Label htmlFor="packages">Number of packages</Label>
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
            <Label htmlFor="volumeCbm">
              Volume (CBM){" "}
              <span className="font-normal text-muted-foreground">optional</span>
            </Label>
            <Input
              id="volumeCbm"
              name="volumeCbm"
              type="number"
              min="0"
              step="0.0001"
              inputMode="decimal"
              placeholder="0.0000"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="unitRate">Rate per kg (TZS)</Label>
            <Input
              id="unitRate"
              name="unitRate"
              type="number"
              min="0"
              step="1"
              inputMode="numeric"
              defaultValue={defaultRate}
            />
          </div>
        </div>
      </section>

      {/* Batch & notes */}
      <section className="rounded-xl border bg-card p-6 shadow-soft">
        <h2 className="font-display font-semibold">Batch &amp; notes</h2>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="batchId">Add to batch</Label>
            <NativeSelect id="batchId" name="batchId" defaultValue="">
              <option value="">Not yet — assign later</option>
              {openBatches.map((batch) => (
                <option key={batch.id} value={batch.id}>
                  {batch.batchNumber}
                </option>
              ))}
            </NativeSelect>
            {openBatches.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No open batches.{" "}
                <Link href="/app/batches/new" className="underline">
                  Open one
                </Link>
                .
              </p>
            ) : null}
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
        <SubmitButton variant="brand" pendingLabel="Registering…">
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
