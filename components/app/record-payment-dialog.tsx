"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { Banknote, X } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { PriceChangeNotice } from "@/components/app/price-change-notice";
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
  priceChange,
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
  /**
   * WHAT MOVED THIS PRICE, IF ANYTHING HAS.
   *
   * The desk taking the money is the last person who can catch a figure that
   * is not the one the customer was quoted, and on this queue they never see
   * the cargo page where it is said. Carries its own undo, so a re-price they
   * do not want goes back without leaving the call list.
   */
  priceChange?: {
    changeId: string;
    totalBefore: number;
    totalAfter: number;
    rateBefore: number | null;
    perItemBefore: boolean | null;
    rateAfter: number | null;
    perItem: boolean;
    steps: number;
    reason: string | null;
    changedBy: string | null;
    changedAt: string;
    automatic: boolean;
    reviewed: boolean;
    canReview: boolean;
    canUndo: boolean;
  } | null;
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
        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-4">
          {/* Above the form, not beside it: the figure it is about to take is
              the one this notice is about. */}
          {priceChange ? (
            <PriceChangeNotice
              changeId={priceChange.changeId}
              currency={currency}
              totalBefore={priceChange.totalBefore}
              totalAfter={priceChange.totalAfter}
              rateBefore={priceChange.rateBefore}
              rateAfter={priceChange.rateAfter}
              perItem={priceChange.perItem}
              perItemBefore={priceChange.perItemBefore ?? undefined}
              steps={priceChange.steps}
              reason={priceChange.reason}
              changedBy={priceChange.changedBy ?? t("somebody")}
              changedAt={priceChange.changedAt}
              canReview={priceChange.canReview}
              canUndo={priceChange.canUndo}
              automatic={priceChange.automatic}
              reviewed={priceChange.reviewed}
            />
          ) : null}
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
