"use client";

import { useActionState, useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteCustomer, updateCustomerDetails } from "@/lib/actions/customers";
import type { ActionResult } from "@/lib/actions/types";

type Customer = {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  altPhone: string | null;
  email: string | null;
  city: string | null;
  address: string | null;
};

/**
 * The customer's details, correctable where they are read.
 *
 * The box used to be a list nobody could change from here — the question the
 * owner put was simply "how can Support edit?". The desks allowed to correct
 * a customer get an Edit button on the box itself; the ones allowed to remove
 * a record with no history get Delete beneath it, folded away and asked twice.
 */
export function CustomerDetails({
  customer,
  canEdit,
  canDelete,
}: {
  customer: Customer;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [saved, save] = useActionState<ActionResult<undefined> | undefined, FormData>(
    updateCustomerDetails,
    undefined
  );
  const [removed, remove] = useActionState<ActionResult<undefined> | undefined, FormData>(
    deleteCustomer,
    undefined
  );

  useEffect(() => {
    if (saved?.ok) setEditing(false);
  }, [saved]);

  const rows = [
    { label: t("Customer ID"), value: customer.code },
    { label: t("Phone"), value: customer.phone ?? t("Not on file") },
    { label: t("Other phone"), value: customer.altPhone ?? "—" },
    { label: t("Email"), value: customer.email ?? "—" },
    { label: t("City"), value: customer.city ?? "—" },
    { label: t("Address"), value: customer.address ?? "—" },
  ];

  return (
    <section className="rounded-xl border bg-card p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">{t("Details")}</h2>
        {canEdit && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("Edit")}
          </button>
        ) : null}
      </div>

      {editing ? (
        <form action={save} className="space-y-3">
          <input type="hidden" name="customerId" value={customer.id} />
          {(
            [
              ["name", t("Name"), customer.name, "text"],
              ["phone", t("Phone"), customer.phone ?? "", "tel"],
              ["altPhone", t("Other phone"), customer.altPhone ?? "", "tel"],
              ["email", t("Email"), customer.email ?? "", "email"],
              ["city", t("City"), customer.city ?? "", "text"],
              ["address", t("Address"), customer.address ?? "", "text"],
            ] as const
          ).map(([name, label, value, type]) => (
            <div key={name} className="space-y-1">
              <Label htmlFor={`customer-${name}`} className="text-xs">
                {label}
              </Label>
              <Input
                id={`customer-${name}`}
                name={name}
                type={type}
                defaultValue={value}
                required={name === "name"}
                autoComplete="off"
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            {t("A corrected phone number replaces the old one. To keep both, add the new number in the list of numbers instead.")}
          </p>
          <div className="space-y-1">
            <Label htmlFor="customer-reason" className="text-xs">
              {t("Why")} <span className="text-muted-foreground">{t("(optional)")}</span>
            </Label>
            <Input id="customer-reason" name="reason" placeholder={t("Number was typed wrong")} />
          </div>
          <FormError state={saved} />
          <div className="flex items-center gap-2">
            <SubmitButton size="sm" variant="brand" pendingLabel={t("Saving…")}>
              {t("Save changes")}
            </SubmitButton>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {t("Cancel")}
            </button>
          </div>
        </form>
      ) : (
        <dl className="space-y-3 text-sm">
          {rows.map((item) => (
            <div key={item.label} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{item.label}</dt>
              <dd className="text-right font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {saved?.ok && !editing ? (
        <p className="mt-3 text-xs text-success">{t("Saved.")}</p>
      ) : null}

      {canDelete && !editing ? (
        <div className="mt-4 border-t pt-3">
          {deleting ? (
            <form action={remove} className="space-y-2">
              <input type="hidden" name="customerId" value={customer.id} />
              <p className="text-sm">
                {t("Delete")} <span className="font-semibold">{customer.name}</span> ({customer.code})?{" "}
                <span className="text-muted-foreground">
                  {t("This cannot be undone. A customer with cargo, bills, payments or messages on record cannot be deleted — merge a duplicate instead.")}
                </span>
              </p>
              <Input name="reason" placeholder={t("Why (optional) — e.g. duplicate typed by mistake")} />
              <FormError state={removed} />
              <div className="flex items-center gap-2">
                <SubmitButton size="sm" variant="destructive" pendingLabel={t("Saving…")}>
                  {t("Delete customer")}
                </SubmitButton>
                <button
                  type="button"
                  onClick={() => setDeleting(false)}
                  className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  {t("Cancel")}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setDeleting(true)}
              className="focus-ring inline-flex items-center gap-1.5 rounded text-xs text-muted-foreground transition-colors hover:text-destructive"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t("Delete customer")}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
