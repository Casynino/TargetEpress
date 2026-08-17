"use client";

import { useActionState, useState } from "react";
import { BadgeCheck, Ban } from "lucide-react";

import { FormError, SubmitButton } from "@/components/app/form-feedback";
import { useT } from "@/components/app/locale-provider";
import { Input } from "@/components/ui/input";
import { chargeStorageFee, waiveStorageFee } from "@/lib/actions/storage";
import type { ActionResult } from "@/lib/actions/types";

/**
 * The only human decision in the storage system: collect it, or forgive it.
 *
 * The amount is never typed — it is the policy applied to two dates — so there
 * is no amount field here, only the two ways the business can answer. Waiving
 * asks for a reason and will not proceed without one, because "why was a
 * twelve-day consignment not charged" is the first question anybody asks about
 * this record later.
 *
 * When it has already been waived the card says so plainly, with who and when
 * and why, and still offers to charge it — a decision can be reversed, and both
 * halves stay in the audit log.
 */
export function StorageDecision({
  invoiceId,
  accruedUsd,
  chargedUsd,
  waivedUsd,
  waivedBy,
  waivedOn,
  waiveReason,
  canDecide,
}: {
  invoiceId: string;
  /** What the policy says has accrued, right now. */
  accruedUsd: number;
  chargedUsd: number;
  waivedUsd: number;
  waivedBy: string | null;
  waivedOn: string | null;
  waiveReason: string | null;
  canDecide: boolean;
}) {
  const t = useT();
  const [chargeState, charge] = useActionState<ActionResult | undefined, FormData>(
    chargeStorageFee,
    undefined
  );
  const [waiveState, waive] = useActionState<ActionResult | undefined, FormData>(
    waiveStorageFee,
    undefined
  );
  const [waiving, setWaiving] = useState(false);

  const money = (usd: number) => `USD ${usd.toFixed(2)}`;

  /* Nothing has accrued and nothing was ever waived: no decision to make. */
  if (accruedUsd <= 0 && waivedUsd <= 0 && chargedUsd <= 0) return null;

  return (
    <div className="space-y-2 border-t bg-muted/20 px-4 py-3">
      {/* Where the figure stands: calculated, charged, waived. All three, always. */}
      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t("Calculated")}</dt>
          <dd className="font-semibold tabular-nums">{money(Math.max(accruedUsd, chargedUsd, waivedUsd))}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-muted-foreground">{t("On the bill")}</dt>
          <dd className="font-semibold tabular-nums">{money(chargedUsd)}</dd>
        </div>
        {waivedUsd > 0 ? (
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">{t("Waived")}</dt>
            <dd className="font-semibold tabular-nums text-warning">
              {money(waivedUsd)}
            </dd>
          </div>
        ) : null}
      </dl>

      {waivedUsd > 0 ? (
        <p className="rounded-lg border border-warning/30 bg-warning/[0.06] px-3 py-2 text-xs">
          <span className="font-semibold text-warning">
            {t("Waived")} {money(waivedUsd)}
          </span>
          {waivedBy ? ` · ${t("by")} ${waivedBy}` : ""}
          {waivedOn ? ` · ${waivedOn}` : ""}
          {waiveReason ? (
            <span className="mt-0.5 block text-muted-foreground">
              “{waiveReason}”
            </span>
          ) : null}
        </p>
      ) : null}

      {canDecide ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {accruedUsd > 0 && chargedUsd !== accruedUsd ? (
              <form action={charge}>
                <input type="hidden" name="invoiceId" value={invoiceId} />
                <SubmitButton size="sm" className="h-7 px-2.5 text-[11px]">
                  <BadgeCheck className="mr-1.5 h-3.5 w-3.5" />
                  {waivedUsd > 0
                    ? `${t("Charge it after all")} · ${money(accruedUsd)}`
                    : `${t("Add storage fee")} · ${money(accruedUsd)}`}
                </SubmitButton>
              </form>
            ) : null}

            {waivedUsd === 0 && (accruedUsd > 0 || chargedUsd > 0) ? (
              <button
                type="button"
                onClick={() => setWaiving((v) => !v)}
                aria-expanded={waiving}
                className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-md border border-warning/40 px-2.5 text-[11px] font-medium text-warning hover:bg-warning/10"
              >
                <Ban className="h-3.5 w-3.5" />
                {t("Waive storage fee")}
              </button>
            ) : null}
          </div>

          <FormError state={chargeState} />

          {waiving ? (
            <form action={waive} className="space-y-2 rounded-lg border bg-card p-3">
              <input type="hidden" name="invoiceId" value={invoiceId} />
              <label
                htmlFor={`waive-${invoiceId}`}
                className="block text-xs font-medium"
              >
                {t("Why is the fee being waived?")}
              </label>
              <Input
                id={`waive-${invoiceId}`}
                name="reason"
                required
                placeholder={t("Customer consideration, our delay, goodwill…")}
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                {t(
                  "The fee stays on the record as waived, with your name against it — the customer is not charged, and the figure still appears in storage reporting."
                )}
              </p>
              <FormError state={waiveState} />
              <SubmitButton size="sm" className="h-8 bg-warning text-xs text-white">
                {t("Waive it")}
              </SubmitButton>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
