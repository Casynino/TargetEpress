"use client";

import { useActionState } from "react";
import { Save } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
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
  const t = useT();
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
          {t("Customer")}
        </h2>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="customerName">{t("Name")}</Label>
            <Input
              id="customerName"
              name="customerName"
              defaultValue={cargo.customerName}
              required
            />
            <p className="text-xs text-muted-foreground">
              {t(
                "Changes the customer record, so it updates on their other cargo too."
              )}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="customerPhone">{t("Phone")}</Label>
            {/* Required, because a blank one used to save as no number at
                all — a customer nobody could ring about their own cargo. */}
            <Input
              id="customerPhone"
              name="customerPhone"
              defaultValue={cargo.customerPhone ?? ""}
              inputMode="tel"
              required
            />
          </div>
        </div>
      </section>

      <section className="panel">
        <h2 className="border-b px-5 py-4 font-display font-semibold">
          {t("What is in the boxes")}
        </h2>
        <div className="space-y-4 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="cargoTypeId">{t("Which item?")}</Label>
            <NativeSelect
              id="cargoTypeId"
              name="cargoTypeId"
              defaultValue={cargo.cargoTypeId ?? ""}
            >
              <option value="">{t("Not listed / mixed")}</option>
              {/* Through the dictionary — the same picker as the registration
                  form, and a Chinese desk correcting a consignment should not
                  suddenly be reading English. */}
              {items.map((item) => (
                <option key={item.id} value={item.id}>
                  {t(item.name)}
                </option>
              ))}
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              {t(
                "This is what Finance prices against. Leaving it unset means the general rate."
              )}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">{t("Description")}</Label>
            <Input
              id="description"
              name="description"
              defaultValue={cargo.description}
              required
            />
            <p className="text-xs text-muted-foreground">
              {t("Your own words. The customer sees this when they track.")}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="internalNotes">{t("Internal note")}</Label>
            <Textarea
              id="internalNotes"
              name="internalNotes"
              rows={2}
              defaultValue={cargo.internalNotes ?? ""}
            />
            <p className="text-xs text-muted-foreground">
              {t("Never shown to the customer.")}
            </p>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="border-b px-5 py-4">
          <h2 className="font-display font-semibold">{t("Weigh and count")}</h2>
          <p className="text-xs text-muted-foreground">
            {t(
              "Changing the quantity adds or removes packages, each with its own QR."
            )}
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="weightKg">{t("Weight (kg)")}</Label>
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
            <Label htmlFor="packages">{t("How many")}</Label>
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
            <Label htmlFor="packageType">{t("Counted as")}</Label>
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
                  {t(option.label)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="border-b px-5 py-4">
          <h2 className="font-display font-semibold">{t("Add photos")}</h2>
          <p className="text-xs text-muted-foreground">
            {t(
              "Added to the record. Existing photos are never replaced or removed."
            )}
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
        {t("Save changes")}
      </SubmitButton>
    </form>
  );
}
