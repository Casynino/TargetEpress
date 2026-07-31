"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { PhotoCapture } from "@/components/app/photo-capture";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { updateCargo } from "@/lib/actions/cargo-edit";
import { PACKAGE_TYPE_LABELS, enumOptions } from "@/lib/constants";

export type EditableCargo = {
  id: string;
  trackingNumber: string;
  customerName: string;
  customerPhone: string | null;
  cargoTypeId: string | null;
  description: string;
  weightKg: number;
  packages: number;
  packageType: string;
  internalNotes: string | null;
};

export type ItemOption = { id: string; name: string; category: string };

/**
 * Correcting a record rather than registering a second one.
 *
 * Deliberately the same fields, in the same order, as the receiving form. The
 * person fixing a typo is the person who made it twenty minutes ago, and a
 * different layout would make them hunt.
 *
 * Photos only add. There is no way to remove one here, because the photo of a
 * carton as it arrived is the evidence in a damage claim — replacing it is
 * exactly what a dishonest edit would look like.
 */
export function CargoEditForm({
  cargo,
  items,
  photosDurable,
}: {
  cargo: EditableCargo;
  items: ItemOption[];
  photosDurable: boolean;
}) {
  const [state, action] = useActionState(updateCargo, undefined);

  return (
    <form action={action} className="space-y-6">
      <input type="hidden" name="shipmentId" value={cargo.id} />
      <FormError state={state} />
      {state?.ok && state.data ? (
        <p className="rounded-lg border border-success/40 bg-success/5 p-3 text-sm text-success">
          Saved. {state.data.trackingNumber} is updated everywhere it appears.
        </p>
      ) : null}

      <section className="panel">
        <h2 className="border-b px-5 py-4 font-display font-semibold">
          Customer
        </h2>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="customerName">Name</Label>
            <Input
              id="customerName"
              name="customerName"
              defaultValue={cargo.customerName}
              required
            />
            <p className="text-xs text-muted-foreground">
              Changes the customer record, so it updates on their other cargo
              too.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customerPhone">Phone</Label>
            <Input
              id="customerPhone"
              name="customerPhone"
              defaultValue={cargo.customerPhone ?? ""}
              inputMode="tel"
            />
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="border-b px-5 py-4 font-display font-semibold">
          What is in the boxes
        </h2>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="cargoTypeId">Which item?</Label>
            <NativeSelect
              id="cargoTypeId"
              name="cargoTypeId"
              defaultValue={cargo.cargoTypeId ?? ""}
            >
              <option value="">Not listed / mixed</option>
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              This is what Finance prices against. Leaving it unset means the
              general rate.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              name="description"
              defaultValue={cargo.description}
              required
            />
            <p className="text-xs text-muted-foreground">
              Your own words. The customer sees this when they track.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="internalNotes">Internal note</Label>
            <Textarea
              id="internalNotes"
              name="internalNotes"
              rows={2}
              defaultValue={cargo.internalNotes ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              Never shown to the customer.
            </p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="border-b px-5 py-4">
          <h2 className="font-display font-semibold">Weigh and count</h2>
          <p className="text-xs text-muted-foreground">
            Changing the quantity adds or removes packages, each with its own QR.
          </p>
        </div>
        <div className="grid gap-4 p-5 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="weightKg">Weight (kg)</Label>
            <Input
              id="weightKg"
              name="weightKg"
              type="number"
              step="0.001"
              min="0.001"
              defaultValue={cargo.weightKg}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="packages">How many</Label>
            <Input
              id="packages"
              name="packages"
              type="number"
              min="1"
              defaultValue={cargo.packages}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="packageType">Counted as</Label>
            <NativeSelect
              id="packageType"
              name="packageType"
              defaultValue={cargo.packageType}
            >
              {enumOptions(
                Object.fromEntries(
                  Object.entries(PACKAGE_TYPE_LABELS).map(([key, value]) => [
                    key,
                    value.many.charAt(0).toUpperCase() + value.many.slice(1),
                  ])
                )
              ).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="border-b px-5 py-4">
          <h2 className="font-display font-semibold">Add photos</h2>
          <p className="text-xs text-muted-foreground">
            Added to the record. Existing photos are never replaced or removed.
          </p>
        </div>
        <div className="p-5">
          <PhotoCapture
            name="photos"
            durable={photosDurable}
            label="More photos"
            hint="Optional — anything that was missed at the counter."
            required={false}
          />
        </div>
      </section>

      <SubmitButton variant="brand" pendingLabel="Saving…">
        <Save className="mr-2 h-4 w-4" />
        Save changes
      </SubmitButton>
    </form>
  );
}
