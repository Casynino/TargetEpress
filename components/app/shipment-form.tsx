"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import type { CargoCategory } from "@prisma/client";
import { CheckCircle2, Info, Plane } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { PhotoCapture } from "@/components/app/photo-capture";
import { suggestCargoType } from "@/lib/actions/pricing";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { createShipment, type ShipmentCreated } from "@/lib/actions/shipments";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import type { ActionResult } from "@/lib/actions/types";
import {
  AIRPORT_LABELS,
  CATEGORY_EXAMPLES,
  CATEGORY_LABELS,
  ROUTE_FOR_CATEGORY,
} from "@/lib/cargo";
import { CustomerPicker } from "@/components/app/customer-picker";
import { UnsavedGuard } from "@/components/app/unsaved-guard";

const CATEGORIES: CargoCategory[] = [
  "NORMAL_GOODS",
  "ELECTRONICS",
  "LIQUID_SPECIAL",
];


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
  locale = "en",
  typesByCategory,
  canAddItem,
  photosDurable,
}: {
  /** The reader's language. Passed in: a client component cannot ask. */
  locale?: Locale;
  typesByCategory: Record<string, CargoTypeOption[]>;
  /** Whether this desk may add an item that is not on the list. */
  canAddItem: boolean;
  photosDurable: boolean;
}) {
  const [state, formAction] = useActionState<
    ActionResult<ShipmentCreated>,
    FormData
  >(createShipment, { ok: true });

  const [category, setCategory] = useState<CargoCategory>("NORMAL_GOODS");
  const [cargoTypeId, setCargoTypeId] = useState("");

  /*
    Items this desk has just added, held here until the page is next fetched.

    The action revalidates /app/cargo/new, but this form is mid-entry — the
    clerk has a box on the scale and half a consignment typed. Re-rendering the
    route under them would be worse than a stale list, so the new item is pushed
    into the picker locally and selected, and the server's copy catches up on
    the next load.
  */
  const [addedTypes, setAddedTypes] = useState<
    Record<string, CargoTypeOption[]>
  >({});
  const [addingItem, setAddingItem] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [addPending, setAddPending] = useState(false);

  const route = ROUTE_FOR_CATEGORY[category];
  const types = [
    ...(typesByCategory[category] ?? []),
    ...(addedTypes[category] ?? []),
  ];
  const created = state.ok && state.data?.trackingNumber;

  if (created) {
    return (
      <div className="panel p-8 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 animate-success-pop text-success" />
        <h2 className="mt-4 font-display text-xl font-bold">
          {t(locale, "Cargo registered")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(locale, "Print the label and attach it to the cargo now.")}
        </p>
        <p className="mt-4 font-mono text-2xl font-bold tabular">{created}</p>

        {/* Say where the cargo is now. The clerk did not choose it, so the
            confirmation has to close the loop. */}
        {state.ok && state.data?.batchNumber ? (
          <p className="mt-4 inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {t(locale, "Waiting on the")}
            </span>
            <span className="font-medium">
              {t(
                locale,
                state.data.origin === "HONG_KONG" ? "Hong Kong" : "Guangzhou"
              )}{" "}
              {t(locale, "batch")}
            </span>
          </p>
        ) : null}

        {/* The China desk's loop: register, print the label, register the next
            one. Three 40px pills wrapping awkwardly mid-row is not what that
            deserves on the phone it is done from — stacked and thumb-sized
            below sm, the same row as before above it. */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
          <Link
            href={`/app/cargo/${created}/label`}
            className="inline-flex h-11 items-center justify-center rounded-md bg-signal px-4 text-sm font-medium text-signal-foreground hover:bg-signal/90"
          >
            {t(locale, "Print QR label")}
          </Link>
          <Link
            href={`/app/cargo/${created}`}
            className="inline-flex h-11 items-center justify-center rounded-md border px-4 text-sm hover:bg-muted"
          >
            {t(locale, "View cargo")}
          </Link>
          <a
            href="/app/cargo/new"
            className="inline-flex h-11 items-center justify-center rounded-md border px-4 text-sm hover:bg-muted"
          >
            {t(locale, "Register another")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-6">
      {/* Fifteen fields deep, on a phone, with no browser back button behind
          it — one stray tap on a link used to empty the lot without asking. */}
      <UnsavedGuard />

      {/* 1. Customer */}
      <section className="panel p-6">
        <h2 className="font-display font-semibold">{t(locale, "1. Customer")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            locale,
            "Find them if we have shipped for them before. If not, record them once and they are in the book from then on."
          )}
        </p>

        <div className="mt-5">
          <CustomerPicker locale={locale} />
        </div>
      </section>

      {/* 2. What the cargo is */}
      <section className="panel p-6">
        <h2 className="font-display font-semibold">{t(locale, "2. What is the cargo?")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            locale,
            "This is the only classification you make. The system works out the airport and the price from it."
          )}
        </p>

        <fieldset className="mt-5 grid gap-2">
          <legend className="sr-only">{t(locale, "Cargo category")}</legend>
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
                    {t(locale, CATEGORY_LABELS[option])}
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {t(locale, CATEGORY_EXAMPLES[option])}
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
              {t(locale, `Departs ${AIRPORT_LABELS[route]}`)}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {t(
                locale,
                "Chosen automatically from the cargo category — you do not set this."
              )}
            </p>
          </div>
        </div>

        {types.length > 0 ? (
          <div className="mt-5 space-y-2">
            <Label htmlFor="cargoTypeId">
              {t(locale, "Which item?")}{" "}
              <span className="font-normal text-muted-foreground">
                {t(locale, "helps Finance price it correctly")}
              </span>
            </Label>
            <NativeSelect
              id="cargoTypeId"
              name="cargoTypeId"
              value={cargoTypeId}
              onChange={(e) => setCargoTypeId(e.target.value)}
            >
              <option value="">{t(locale, "Not listed / mixed")}</option>
              {/* Through the dictionary, like every other string on this form.
                  The name is a database row rather than a literal, so it is
                  looked up by the English it stores — an item added later reads
                  in English until its line exists, which is a gap rather than a
                  break. */}
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {t(locale, type.name)}
                </option>
              ))}
            </NativeSelect>
            {category === "ELECTRONICS" && !cargoTypeId ? (
              <p className="flex items-start gap-1.5 text-xs text-warning">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t(
                  locale,
                  "Electronics are priced per item. Without an item, Finance will have to price this one by hand."
                )}
              </p>
            ) : null}

            {/*
              ADDING WHAT IS IN FRONT OF YOU.

              The desk holding the box is the only one who knows what is in it,
              and until now an item missing from this list left one option:
              leave it unlisted and let Finance price it on the general rate,
              which the warning above says is usually wrong. Most consignments
              went out that way.

              It adds the ITEM and never a price. The new type carries no rule,
              so this consignment is priced exactly as an unlisted one would
              have been — no worse on the money, better on the record, because
              it now says what it is. Finance prices it afterwards, from a name
              chosen by somebody who saw the goods.

              Not a nested form: this whole page is one useActionState, so the
              action is called straight from the handler.
            */}
            {canAddItem ? (
              addingItem ? (
                <div className="space-y-2 rounded-lg border bg-muted/30 p-2.5">
                  <Label htmlFor="newItemName" className="text-xs">
                    {t(locale, "What is it? Add it to the list")}
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    <Input
                      id="newItemName"
                      value={newItemName}
                      onChange={(e) => setNewItemName(e.target.value)}
                      placeholder={t(locale, "e.g. Power banks")}
                      className="h-9 min-w-[160px] flex-1"
                      maxLength={60}
                    />
                    <button
                      type="button"
                      disabled={addPending || newItemName.trim().length < 2}
                      onClick={async () => {
                        setAddPending(true);
                        setAddError(null);
                        const fd = new FormData();
                        fd.set("name", newItemName.trim());
                        fd.set("category", category);
                        const result = await suggestCargoType(undefined, fd);
                        setAddPending(false);
                        if (!result.ok) {
                          setAddError(result.error);
                          return;
                        }
                        const added = result.data;
                        if (!added) return;
                        setAddedTypes((prev) => ({
                          ...prev,
                          [category]: [
                            ...(prev[category] ?? []).filter(
                              (x) => x.id !== added.id
                            ),
                            added,
                          ],
                        }));
                        setCargoTypeId(added.id);
                        setNewItemName("");
                        setAddingItem(false);
                      }}
                      className="focus-ring inline-flex h-9 items-center rounded-md bg-brand px-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {addPending ? t(locale, "Adding…") : t(locale, "Add it")}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingItem(false);
                        setNewItemName("");
                        setAddError(null);
                      }}
                      className="focus-ring inline-flex h-9 items-center rounded-md px-2 text-sm text-muted-foreground hover:text-foreground"
                    >
                      {t(locale, "Never mind")}
                    </button>
                  </div>
                  {addError ? (
                    <p className="text-xs text-destructive">{addError}</p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {t(
                      locale,
                      "This adds the item so the cargo is labelled correctly. It sets no price — Finance still does that."
                    )}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingItem(true)}
                  className="focus-ring text-xs font-medium text-brand underline-offset-2 hover:underline"
                >
                  {t(locale, "Item not on the list? Add it")}
                </button>
              )
            ) : null}
          </div>
        ) : null}

        <div className="mt-5 space-y-2">
          <Label htmlFor="description">{t(locale, "Description")}</Label>
          <Input
            id="description"
            name="description"
            placeholder={t(locale, "What is actually in the boxes")}
            autoComplete="off"
            required
          />
          <p className="text-xs text-muted-foreground">
            {t(
              locale,
              "Your own words. This is what the customer sees when they track, and what appears on the invoice."
            )}
          </p>
        </div>
      </section>

      {/* 3. Weigh and count */}
      <section className="panel p-6">
        <h2 className="font-display font-semibold">
          {t(locale, "3. Weigh and count")}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            locale,
            "Weigh before you record. This weight is what the customer is billed on, so it has to be right."
          )}
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="weightKg">{t(locale, "Weight (kg)")}</Label>
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
            <Label htmlFor="packages">{t(locale, "How many")}</Label>
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
            <Label htmlFor="packageType">{t(locale, "Counted as")}</Label>
            <NativeSelect
              id="packageType"
              name="packageType"
              required
              defaultValue={category === "NORMAL_GOODS" ? "PACKAGE" : "PIECE"}
              key={category}
            >
              <option value="CARTON">{t(locale, "Cartons")}</option>
              <option value="PIECE">{t(locale, "Pieces")}</option>
              <option value="PACKAGE">{t(locale, "Packages")}</option>
              <option value="BAG">{t(locale, "Bags")}</option>
              <option value="BOX">{t(locale, "Boxes")}</option>
              <option value="ENVELOPE">{t(locale, "Envelopes")}</option>
              <option value="OTHER">{t(locale, "Other")}</option>
            </NativeSelect>
            <p className="text-xs text-muted-foreground">
              {t(
                locale,
                "Recorded with the quantity and shown everywhere it appears. Cargo on a per-item rate — a phone, a laptop, a camera — is always saved as pieces, because that count is what the customer is charged for."
              )}
            </p>
          </div>
        </div>
      </section>

      {/* 4. Photograph */}
      <section className="panel p-6">
        <h2 className="font-display font-semibold">
          {t(locale, "4. Photograph the cargo")}{" "}
          <span className="text-signal">*</span>
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            locale,
            "Required. This is the proof of what we received and the condition it arrived in — it settles disputes months later."
          )}
        </p>
        <div className="mt-5">
          <PhotoCapture
            name="photos"
            required
            max={4}
            label={t(locale, "Receiving photos")}
            hint="One is enough, but photograph any damage separately."
            durable={photosDurable}
          />
        </div>
      </section>

      {/* 5. Notes */}
      <section className="panel p-6">
        <h2 className="font-display font-semibold">{t(locale, "5. Notes")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {t(
            locale,
            "The batch is chosen for you from the cargo type — you never pick it."
          )}
        </p>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="internalNotes">
              {t(locale, "Internal notes")}{" "}
              <span className="font-normal text-muted-foreground">
                {t(locale, "never shown to the customer")}
              </span>
            </Label>
            <Textarea
              id="internalNotes"
              name="internalNotes"
              rows={3}
              placeholder={t(
                locale,
                "Supplier name, carton markings, anything the Dar team should know."
              )}
            />
          </div>
        </div>
      </section>

      <FormError state={state} />

      {/* Fifteen fields end here, and on a phone that is a long way down. The
          primary takes the full width so it cannot be mistaken for one more
          field, and Cancel gets the same 44px as everything else it sits beside
          — it was 40, the one control on the screen under the line. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <SubmitButton
          variant="signal"
          pendingLabel="Registering…"
          className="w-full sm:w-auto"
        >
          {t(locale, "Register cargo")}
        </SubmitButton>
        <Link
          href="/app/cargo"
          className="inline-flex h-11 items-center justify-center rounded-md border px-4 text-sm hover:bg-muted sm:justify-start"
        >
          {t(locale, "Cancel")}
        </Link>
      </div>
    </form>
  );
}
