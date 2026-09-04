"use client";

import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";

import { ChangeRate } from "@/components/app/change-rate";
import { CreditRequest } from "@/components/app/credit-request";
import { AddStorage } from "@/components/app/add-storage";
import { GiveDiscount } from "@/components/app/give-discount";
import { WaiveStorage } from "@/components/app/waive-storage";
import { useT } from "@/components/app/locale-provider";
import { Button } from "@/components/ui/button";
import { creditContextFor } from "@/lib/actions/credit";
import Link from "next/link";

/** The same money formatting the credit panel uses, so the two agree. */
const money = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Everything you can do to ONE bill, on the screen that settles several.
 *
 * The merge screen takes one payment across a customer's whole list, and the
 * panel beside it had nothing but the payment — so opening a bill, discounting
 * it, re-quoting its rate or letting it go on credit meant leaving for the
 * cargo page and coming back. These are the same controls the single-payment
 * panel carries, and they behave the same way.
 *
 * THEY APPEAR ONLY WHEN EXACTLY ONE BILL IS TICKED, because every one of them
 * is a decision about a particular bill. "Open invoice" with three ticked has
 * no answer, and a discount would have to guess which one it came off. Ticking
 * back to one brings them back, and the line below says so rather than leaving
 * a reader wondering where they went.
 */
export function BillActions({
  bill,
  bills,
  selectedCount,
  canDiscount,
  canChangeRate,
  canApproveCredit,
  canWaiveStorage,
}: {
  bill:
    | {
        invoiceId: string;
        invoiceNumber: string;
        currency: string;
        total: number;
        discount: number;
        exchangeRate: number | null;
        storage: number;
        storageUncharged: number;
        storageFreeDaysLeft: number | null;
        creditStatus: string;
        outstanding: number;
      }
    | null;
  /** Every ticked bill. Discount and rate act on all of them at once. */
  bills?: {
    invoiceId: string;
    currency: string;
    total: number;
    discount: number;
    exchangeRate: number | null;
    storage: number;
    storageUncharged: number;
    storageFreeDaysLeft: number | null;
    creditStatus: string;
    outstanding: number;
  }[];
  selectedCount: number;
  canDiscount?: boolean;
  canChangeRate?: boolean;
  /** Whether pressing it GRANTS the terms or asks Finance for them. */
  canApproveCredit?: boolean;
  /** invoice.storage.waive. Support holds this where it has no discount. */
  canWaiveStorage?: boolean;
}) {
  const t = useT();
  const [credit, setCredit] = useState<Awaited<
    ReturnType<typeof creditContextFor>
  > | null>(null);

  /*
    THE TERMS ARE THE CUSTOMER'S, SO THEY ARE FETCHED ONCE.

    This ran on every tick and cleared the answer first, so "Release on credit"
    vanished and reappeared each time a box was ticked — the desk saw the panel
    stutter and waited to see whether the button was coming back.

    Nothing it fetches actually moves with the ticking: the limit, what the
    customer already owes on terms and the agreed term days belong to the
    customer, not the selection. The one thing that does move — the amount
    being put on terms — is the sum of what is ticked, which is already on this
    screen. So it is asked for once, while the page is loading, and the tick
    itself costs nothing.
  */
  const anchorId = (bills?.[0] ?? bill)?.invoiceId;
  useEffect(() => {
    let live = true;
    if (!anchorId) return;
    creditContextFor(anchorId)
      .then((c) => {
        if (live && c) setCredit(c);
      })
      .catch(() => {
        /* Credit is an extra here. A screen that takes money must not fail
           because the terms could not be looked up. */
      });
    return () => {
      live = false;
    };
    /* Deliberately not the ticked set — see above. */
  }, [anchorId]);

  if (selectedCount === 0) return null;


  /*
    DISCOUNT AND RATE WORK ON EVERYTHING TICKED; the rest needs one bill.

    A payment that covers two consignments is one conversation — "take fifty
    thousand off" means off the lot, and "we agreed 2,800" means on both — so
    those two act on the whole set and the server splits or applies
    accordingly. Opening an invoice or releasing on credit still needs a single
    bill named, because neither has an answer for three at once.
  */
  const many = bills && bills.length > 0 ? bills : bill ? [bill] : [];
  const ids = many.map((b) => b.invoiceId).join(",");
  /*
    THE STORAGE ON WHAT IS TICKED.

    Each consignment's clock runs from the day that box landed, so a customer
    collecting three at once can be carrying three different fees — and the
    desk was shown none of them here. Summed for the figure, counted for the
    sentence, and forgiven in one gesture that still writes an audit line per
    bill. It is never removed by the system: the clock keeps running and
    somebody has to decide.
  */
  /* Whether credit can be asked for at all: the bill's own state, so the
     control renders with the rest of the panel instead of arriving after it. */
  const creditable = many.filter((b) => b.creditStatus === "NONE");
  const creditOutstanding =
    Math.round(
      creditable.reduce((n, b) => n + Math.max(0, b.outstanding), 0) * 100
    ) / 100;

  const withStorage = many.filter((b) => b.storage > 0.005);
  const storageTotal = withStorage.reduce((sum, b) => sum + b.storage, 0);
  /* Accrued and not on the bill — a different figure and a different press. */
  const unchargedBills = many.filter((b) => b.storageUncharged > 0.005);
  const unchargedTotal = unchargedBills.reduce(
    (sum, b) => sum + b.storageUncharged,
    0
  );

  const combinedDiscount =
    Math.round(many.reduce((n, b) => n + b.discount, 0) * 100) / 100;
  const combinedTotal =
    Math.round(many.reduce((n, b) => n + b.total, 0) * 100) / 100;
  /* Every bill this business raises is in one currency, and a mixed set has no
     single rate to set — so the rate control stands down rather than guess. */
  const oneCurrency = new Set(many.map((b) => b.currency)).size === 1;
  const sharedRate =
    new Set(many.map((b) => b.exchangeRate)).size === 1
      ? (many[0]?.exchangeRate ?? null)
      : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {bill ? (
        <>
          <Button asChild size="sm" variant="outline" className="gap-1.5 px-2.5">
            <Link href={`/app/finance/invoices/${bill.invoiceNumber}`}>
              <FileText className="h-3.5 w-3.5" />
              {t("Open invoice")}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline" className="gap-1.5 px-2.5">
            <a href={`/app/finance/invoices/${bill.invoiceNumber}/pdf`}>
              <Download className="h-3.5 w-3.5" />
              {t("Download")}
            </a>
          </Button>
        </>
      ) : null}
      {/* Mapped exactly as the credit panel maps it, so one bill reads the
          same however it is reached. */}
      {/* Every ticked bill, on one set of terms — the action releases them in
          a single transaction, so either all of them go on credit or none. */}
      {creditable.length > 0 && creditOutstanding > 0.005 ? (
        <CreditRequest
          invoiceId={creditable.map((b) => b.invoiceId).join(",")}
          across={creditable.length}
          /* Summed here, from what is ticked, rather than waited for. */
          outstanding={money(creditOutstanding, many[0]!.currency)}
          defaultTerm={credit?.termDays ?? 14}
          limitLabel={
            credit && credit.limitUsd !== null
              ? money(credit.limitUsd, "USD")
              : null
          }
          outstandingLabel={
            credit && credit.alreadyOwesUsd > 0.005
              ? money(credit.alreadyOwesUsd, "USD")
              : null
          }
          canApprove={canApproveCredit ?? false}
        />
      ) : null}
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {/* Storage is per consignment — each box has its own clock — so this
            answers for the one bill in front of the desk, unlike the discount
            and the rate, which are agreed over the whole payment. */}
        {/* Putting the late days ON the bill, so the total the customer is
            asked for is the total they owe. Only when there are days the
            invoice does not yet know about. */}
        {canWaiveStorage && unchargedTotal > 0.005 ? (
          <AddStorage
            invoiceId={unchargedBills.map((b) => b.invoiceId).join(",")}
            amount={unchargedTotal}
            across={unchargedBills.length}
            currency={many[0]!.currency}
            rate={many[0]!.exchangeRate}
          />
        ) : null}
        {canWaiveStorage ? (
          <WaiveStorage
            /* Only the bills that actually carry a fee. */
            invoiceId={withStorage.map((b) => b.invoiceId).join(",")}
            storage={storageTotal}
            across={withStorage.length}
            currency={many[0]!.currency}
            rate={many[0]!.exchangeRate}
            /* When nothing has accrued the control says so instead of
               vanishing — the fewest free days across what is ticked, since
               that is the one that runs out first. */
            freeDaysLeft={
              storageTotal > 0
                ? null
                : many.reduce<number | null>((least, b) => {
                    if (b.storageFreeDaysLeft === null) return least;
                    return least === null
                      ? b.storageFreeDaysLeft
                      : Math.min(least, b.storageFreeDaysLeft);
                  }, null)
            }
          />
        ) : null}
        {canDiscount && oneCurrency ? (
          <GiveDiscount
            invoiceId={ids}
            currency={many[0]!.currency}
            current={combinedDiscount}
            across={many.length}
            rate={sharedRate}
          />
        ) : null}
        {canChangeRate && oneCurrency ? (
          <ChangeRate
            invoiceId={ids}
            currency={many[0]!.currency}
            current={sharedRate}
            total={combinedTotal}
            across={many.length}
          />
        ) : null}
      </div>
      {!bill && many.length > 1 ? (
        <p className="w-full text-[11px] text-muted-foreground">
          {t("Opening a bill needs a single one ticked.")}
        </p>
      ) : null}
    </div>
  );
}
