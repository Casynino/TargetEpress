"use client";

import { useEffect, useState } from "react";
import { Download, FileText } from "lucide-react";

import { ChangeRate } from "@/components/app/change-rate";
import { CreditRequest } from "@/components/app/credit-request";
import { GiveDiscount } from "@/components/app/give-discount";
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
}: {
  bill:
    | {
        invoiceId: string;
        invoiceNumber: string;
        currency: string;
        total: number;
        discount: number;
        exchangeRate: number | null;
      }
    | null;
  /** Every ticked bill. Discount and rate act on all of them at once. */
  bills?: {
    invoiceId: string;
    currency: string;
    total: number;
    discount: number;
    exchangeRate: number | null;
  }[];
  selectedCount: number;
  canDiscount?: boolean;
  canChangeRate?: boolean;
  /** Whether pressing it GRANTS the terms or asks Finance for them. */
  canApproveCredit?: boolean;
}) {
  const t = useT();
  const [credit, setCredit] = useState<Awaited<
    ReturnType<typeof creditContextFor>
  > | null>(null);

  /* Asked for only once a single bill is settled on, so the common case —
     ticking through a list — costs nothing. */
  useEffect(() => {
    let live = true;
    setCredit(null);
    if (!bill) return;
    creditContextFor(bill.invoiceId)
      .then((c) => {
        if (live) setCredit(c);
      })
      .catch(() => {
        /* Credit is an extra here. A screen that takes money must not fail
           because the terms could not be looked up. */
      });
    return () => {
      live = false;
    };
  }, [bill?.invoiceId]);

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
      {credit ? (
        <CreditRequest
          invoiceId={credit.invoiceId}
          outstanding={money(credit.outstanding, credit.currency)}
          defaultTerm={credit.termDays}
          limitLabel={
            credit.limitUsd === null ? null : money(credit.limitUsd, "USD")
          }
          outstandingLabel={
            credit.alreadyOwesUsd > 0.005
              ? money(credit.alreadyOwesUsd, "USD")
              : null
          }
          canApprove={canApproveCredit ?? false}
        />
      ) : null}
      <div className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        {canDiscount && oneCurrency ? (
          <GiveDiscount
            invoiceId={ids}
            currency={many[0]!.currency}
            current={combinedDiscount}
            across={many.length}
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
          {t("Opening a bill or releasing on credit needs a single one ticked.")}
        </p>
      ) : null}
    </div>
  );
}
