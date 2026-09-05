"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Banknote, X } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { RecordCollectionForm } from "@/components/app/record-collection-form";

/**
 * Taking the payment from the row it is listed on.
 *
 * The icon on this list used to be a link: Finance was sent to the cargo page
 * to find the panel, Support to a page of its own. Both meant leaving the call
 * list — the one screen a desk works down while a customer is on the phone —
 * and finding the way back to the row they were on. It opens the form here
 * instead, the way correcting a claim already does.
 *
 * The form inside is the SAME form either page used. Finance records the money
 * and Support hands the claim to Finance, and which one it is was already
 * decided by `canRecord` rather than by which screen you came from, so there
 * is one form to learn and one place its rules live.
 */
export function RecordPaymentDialog({
  invoiceId,
  invoiceNumber,
  customerName,
  trackingNumber,
  goods,
  outstanding,
  currency,
  rate,
  banks,
  canRecord,
  canAdjust,
  canDiscount,
  canChangeRate,
  invoiceDiscount,
  invoiceTotal,
  storage,
  storageUncharged,
  storageFreeDaysLeft,
  canWaiveStorage,
  label,
}: {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  trackingNumber: string;
  goods: string;
  outstanding: number;
  currency: string;
  rate: number | null;
  banks?: { id: string; name: string; currency: string; kind: string }[] | null;
  canRecord?: boolean;
  /** ledger.adjust — may clear a difference that will never arrive. */
  canAdjust?: boolean;
  canDiscount?: boolean;
  canChangeRate?: boolean;
  invoiceDiscount?: number;
  invoiceTotal?: number;
  /** Storage on the bill, and whether this reader may forgive it. */
  storage?: number;
  storageUncharged?: number;
  storageFreeDaysLeft?: number | null;
  canWaiveStorage?: boolean;
  /** For the screen reader, so the row it belongs to is not a guess. */
  label: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(true)}
      aria-label={label}
      className="focus-ring inline-flex h-7 w-7 items-center justify-center rounded-md border border-brand/40 text-brand transition-colors hover:bg-brand/10"
    >
      <Banknote className="h-3.5 w-3.5" />
    </button>
  );

  if (!open) return trigger;

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-4 sm:items-start sm:py-10"
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-lg rounded-xl border bg-card shadow-lg">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <p className="text-sm font-semibold">
            {canRecord ? t("Record a payment") : t("Record a customer payment")}
          </p>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("Close")}
            className="focus-ring rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-4">
          <RecordCollectionForm
            invoiceId={invoiceId}
            invoiceNumber={invoiceNumber}
            customerName={customerName}
            trackingNumber={trackingNumber}
            goods={goods}
            outstanding={outstanding}
            currency={currency}
            rate={rate}
            banks={banks}
            canRecord={canRecord}
            canAdjust={canAdjust}
            canDiscount={canDiscount}
            canChangeRate={canChangeRate}
            invoiceDiscount={invoiceDiscount}
            invoiceTotal={invoiceTotal}
            storage={storage}
            storageUncharged={storageUncharged}
            storageFreeDaysLeft={storageFreeDaysLeft}
            canWaiveStorage={canWaiveStorage}
          />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {trigger}
      {typeof document === "undefined"
        ? null
        : createPortal(dialog, document.body)}
    </>
  );
}
