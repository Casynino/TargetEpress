"use client";

import { useState } from "react";
import { Scale, X } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { ReconcileForm } from "@/components/app/reconcile-form";

/**
 * The account check, opened OVER the page instead of unfolded inside a card.
 *
 * It was a <details> that expanded inline, and inside a three-column grid of
 * equal-height cards that was a disaster the owner screenshotted: the open form
 * stretched its whole row, spilled over the neighbouring card, and left the
 * others as towers of empty ground. A form is a moment of focused work — it
 * gets the same treatment as recording a cost from the register: a dialog over
 * the page, the page still there behind it when it closes.
 */
export function AccountCheckButton({
  accountId,
  accountName,
  kind,
  systemBalance,
  currency,
}: {
  accountId: string;
  accountName: string;
  kind: "BANK" | "MOBILE_MONEY" | "CASH";
  systemBalance: number;
  currency: string;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="focus-ring inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-brand/30 bg-brand/10 px-2.5 text-[11px] font-semibold text-brand transition-colors hover:bg-brand/20"
      >
        <Scale className="h-3 w-3" />
        {t("Check")}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-background/70 p-4 backdrop-blur-sm sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label={`${t("Check")} ${accountName}`}
          onClick={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="mx-auto max-w-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-sm font-semibold text-foreground">
                {accountName}
              </p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="focus-ring inline-flex items-center gap-1.5 rounded-lg border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
              >
                <X className="h-3.5 w-3.5" />
                {t("Close")}
              </button>
            </div>
            <div className="rounded-xl border bg-card p-4 shadow-lift">
              <ReconcileForm
                accountId={accountId}
                kind={kind}
                systemBalance={systemBalance}
                currency={currency}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
