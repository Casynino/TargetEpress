import { AlertTriangle, CheckCircle2, Clock, PackageCheck } from "lucide-react";

import { StorageDecision } from "@/components/app/storage-decision";
import { STORAGE_POLICY, type StorageStatus } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { formatShillings } from "@/lib/fx";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";

/**
 * How long this cargo has been here, and what that costs.
 *
 * Small on purpose. The first version was a full-width band of five big cells
 * across the top of the page, which gave the loudest position on the screen to
 * a figure that is usually zero — and pushed the cargo itself below the fold.
 * It sits in the side column beside the payment panel now, because that is
 * where the question gets asked: somebody is about to take money and needs to
 * know whether storage is part of it.
 *
 * Four states, carried by colour: quiet inside the free days, amber on the last
 * free day — the day to make a phone call — red once it is charging, grey once
 * collected, when the clock has stopped and the number is history.
 */
export function StorageStatusCard({
  status,
  locale,
  rate,
  /** Present for Finance: the charge/waive decision, on the same card. */
  decision,
  className,
}: {
  status: StorageStatus;
  locale: Locale;
  /** USD → TZS, so the fee reads in the money the customer will hand over. */
  rate: number | null;
  decision?: {
    invoiceId: string;
    chargedUsd: number;
    waivedUsd: number;
    waivedBy: string | null;
    waivedAt: Date | null;
    waiveReason: string | null;
    canDecide: boolean;
  };
  className?: string;
}) {
  if (!status.arrivedAt) return null;

  const tone = status.collected
    ? {
        key: "Collected",
        icon: PackageCheck,
        text: "text-muted-foreground",
        edge: "border-l-muted-foreground/40",
      }
    : status.expired
      ? {
          key: "Fee running",
          icon: AlertTriangle,
          text: "text-destructive",
          edge: "border-l-destructive",
        }
      : status.lastFreeDay
        ? {
            key: "Last free day",
            icon: Clock,
            text: "text-warning",
            edge: "border-l-warning",
          }
        : {
            key: "Free storage",
            icon: CheckCircle2,
            text: "text-success",
            edge: "border-l-success",
          };

  const money = (usd: number) => formatShillings(usd, rate);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-l-2 bg-card",
        tone.edge,
        className
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-2.5">
        <p className="flex items-center gap-1.5 text-xs font-semibold">
          <tone.icon className={cn("h-3.5 w-3.5", tone.text)} />
          {t(locale, "Storage")}
        </p>
        <span className={cn("text-[11px] font-semibold", tone.text)}>
          {t(locale, tone.key)}
        </span>
      </div>

      {/* One line of arithmetic, not a dashboard: days, allowance, and the
          money — which is the whole question. */}
      <div className="border-t px-4 py-2.5">
        <p className="flex items-baseline justify-between gap-2 text-sm">
          <span className="text-muted-foreground">
            {t(locale, "Day")} {status.daysInWarehouse}{" "}
            <span className="text-xs">
              {t(locale, "of")} {status.freeDays} {t(locale, "free")}
            </span>
          </span>
          {/*
            DAYS, not money.

            This led with a running shilling figure on every screen that showed a
            consignment, which made a warehouse clerk read a price they cannot
            act on and quietly turned an operational fact into an accounting one.
            What anybody looking at cargo actually needs is how long it has been
            sitting past its free week — that is the thing you ring a customer
            about. The money is worked out when they come to pay, on the decision
            below, where somebody is actually taking it.
          */}
          <span
            className={cn(
              "font-display font-bold tabular-nums",
              status.expired ? "text-destructive" : "text-success"
            )}
          >
            {status.expired
              ? `${status.chargeableDays} ${t(locale, status.chargeableDays === 1 ? "day late" : "days late")}`
              : t(locale, "on time")}
          </span>
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {status.collected
            ? `${t(locale, "Collected — the clock stopped")} · ${formatDate(status.arrivedAt, locale)}`
            : status.expired
              ? `${t(locale, "uncollected since")} ${formatDate(status.arrivedAt, locale)} · ${t(locale, "charged at pickup")}`
              : `${status.freeDaysRemaining} ${t(locale, status.freeDaysRemaining === 1 ? "free day left" : "free days left")} · USD ${STORAGE_POLICY.perDayUsd}/${t(locale, "day")} ${t(locale, "after that")}`}
        </p>
      </div>

      {decision ? (
        <StorageDecision
          invoiceId={decision.invoiceId}
          accruedUsd={status.chargeUsd}
          chargedUsd={decision.chargedUsd}
          waivedUsd={decision.waivedUsd}
          waivedBy={decision.waivedBy}
          waivedOn={decision.waivedAt ? formatDate(decision.waivedAt, locale) : null}
          waiveReason={decision.waiveReason}
          canDecide={decision.canDecide}
        />
      ) : null}
    </section>
  );
}
