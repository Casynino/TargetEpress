"use client";

import { useActionState, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Boxes } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput } from "@/components/ui/money-input";
import { combinePackages } from "@/lib/actions/combine-packages";
import type { ActionResult } from "@/lib/actions/types";

/**
 * PUTTING SEVERAL OF ONE CUSTOMER'S BOXES INTO ONE CARTON.
 *
 * The same door on both floors: Guangzhou tapes boxes together before the
 * flight, Dar repacks them after one. The screens that offer it differ because
 * the two floors read different lists; what happens when it is pressed does
 * not.
 *
 * It shows the customer, the consignments and the total weight BEFORE the
 * press, because that is the moment a mistake is still free — a carton taped
 * around the wrong box has to be cut open again.
 *
 * NOT MERGE PAYMENT, which puts several charges into one payment. This puts
 * several boxes into one parcel, changes no bill and moves no money.
 */
export function CombinePackages({
  rows,
  onDone,
}: {
  /** What the desk ticked. One entry per consignment. */
  rows: {
    shipmentId: string;
    trackingNumber: string;
    customerName: string;
    /** Null where the floor may not see a customer id — then the server
        decides, and the dialog simply cannot pre-warn about a mismatch. */
    customerId?: string | null;
    weightKg?: number | null;
    packages?: number | null;
  }[];
  /** Clears the table's selection once the carton exists. */
  onDone?: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [state, action] = useActionState<
    ActionResult<{ reference: string; packages: number }>,
    FormData
  >(combinePackages, { ok: true });

  useEffect(() => {
    if (state.ok && state.data) {
      setOpen(false);
      onDone?.();
    }
  }, [state]);

  /*
    THE SAME-CUSTOMER RULE, SAID BEFORE THE PRESS.

    The server refuses a mixed selection and is the only thing that makes that
    guarantee — this is so the desk is told while they can still untick,
    instead of filling the form in and being refused at the end.
  */
  const customers = Array.from(new Set(rows.map((r) => r.customerName)));
  const mixed = customers.length > 1;
  const summed =
    Math.round(rows.reduce((kg, r) => kg + (r.weightKg ?? 0), 0) * 1000) / 1000;
  const boxes = rows.reduce((n, r) => n + (r.packages ?? 1), 0);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={rows.length < 2}
        title={
          rows.length < 2
            ? t("Tick at least two consignments to combine them.")
            : undefined
        }
      >
        <Boxes className="mr-1.5 h-3.5 w-3.5" />
        {t("Combine packages")}
      </Button>
    );
  }

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <form
        action={action}
        className="w-full max-w-md space-y-3 rounded-xl border bg-card p-4 shadow-lg"
      >
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Boxes className="h-4 w-4 text-brand" />
            {t("Combine packages")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t("Use this when the boxes have actually been packed into one carton.")}
          </p>
        </div>

        <input
          type="hidden"
          name="shipmentIds"
          value={rows.map((r) => r.shipmentId).join(",")}
        />

        {/* Who, what and how much — the three facts the owner asked to see
            before the press. */}
        <dl className="space-y-1 rounded-lg border bg-muted/40 px-2.5 py-2 text-[11px]">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{t("Customer")}</dt>
            <dd className={mixed ? "font-semibold text-destructive" : "font-medium"}>
              {customers.join(", ")}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{t("Packages")}</dt>
            <dd className="font-medium tabular-nums">
              {rows.length} {t(rows.length === 1 ? "consignment" : "consignments")}
              {boxes !== rows.length ? ` · ${boxes} ${t("boxes")}` : ""}
            </dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{t("Total weight")}</dt>
            <dd className="font-medium tabular-nums">
              {summed > 0 ? `${summed} ${t("kg")}` : "—"}
            </dd>
          </div>
        </dl>

        {/* The consignments themselves, named. A carton is taped around real
            boxes and the desk should recognise every one of them. */}
        <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border p-2 text-[11px]">
          {rows.map((r) => (
            <li key={r.shipmentId} className="flex items-baseline justify-between gap-3">
              <span className="font-mono">{r.trackingNumber}</span>
              <span className="text-muted-foreground tabular-nums">
                {r.weightKg ? `${r.weightKg} ${t("kg")}` : "—"}
              </span>
            </li>
          ))}
        </ul>

        {mixed ? (
          <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-[11px] font-medium text-destructive">
            {t("Those packages belong to different customers. Only one customer's packages can be combined.")}
          </p>
        ) : null}

        <label className="block space-y-1">
          <span className="block text-xs font-medium text-muted-foreground">
            {t("Weight of the combined carton")}{" "}
            <span className="font-normal">{t("(optional)")}</span>
          </span>
          <MoneyInput
            name="statedWeightKg"
            value={weight}
            onValueChange={setWeight}
            decimals={2}
            placeholder={summed > 0 ? String(summed) : "0.00"}
          />
          {/* Said plainly, because it is the question a warehouse asks first. */}
          <span className="block text-[11px] text-muted-foreground">
            {t("For the floor to read. It changes no price and no bill — each consignment keeps its own weight and its own charge.")}
          </span>
        </label>

        <Input
          name="note"
          placeholder={t("Note (optional) — one carton, taped and labelled")}
          className="h-8 text-xs"
        />

        <p className="text-xs font-medium">
          {t("Are you sure you want to combine these packages into one package?")}
        </p>

        <FormError state={state} />
        <div className="flex items-center gap-2">
          <SubmitButton
            variant="brand"
            size="sm"
            pendingLabel={t("Combining…")}
            disabled={mixed || rows.length < 2}
          >
            {t("Yes, combine")}
          </SubmitButton>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="focus-ring rounded text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {t("Cancel")}
          </button>
        </div>
      </form>
    </div>
  );

  return typeof document === "undefined"
    ? null
    : createPortal(dialog, document.body);
}
