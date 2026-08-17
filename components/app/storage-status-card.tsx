import { AlertTriangle, CheckCircle2, Clock, PackageCheck } from "lucide-react";

import { StorageDecision } from "@/components/app/storage-decision";
import { STORAGE_POLICY, type StorageStatus } from "@/lib/constants";
import { formatDate } from "@/lib/format";
import { formatShillings } from "@/lib/fx";
import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import { cn } from "@/lib/utils";

/**
 * How long this cargo has been in the warehouse, and what that costs.
 *
 * The whole point is that nobody does this arithmetic. A clerk asked "cargo hii
 * imekaa siku ngapi?" and the answer lived in two dates on two different
 * screens; now it is one card that states the days, the free allowance, the
 * overdue days, the rate and the running fee, in that order, so the figure can
 * be checked rather than trusted.
 *
 * Four states, and the colour carries them: inside the free days is quiet, the
 * last free day is amber because it is the day to make a phone call, an accrued
 * fee is red, and collected cargo goes grey — the clock has stopped and the
 * number is now history rather than a demand.
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
    /** What is on the bill now. */
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
        wash: "from-muted-foreground/[0.08]",
        ring: "border-border",
      }
    : status.expired
      ? {
          key: "Storage fee active",
          icon: AlertTriangle,
          text: "text-destructive",
          wash: "from-destructive/[0.12]",
          ring: "border-destructive/40",
        }
      : status.lastFreeDay
        ? {
            key: "Last free day",
            icon: Clock,
            text: "text-warning",
            wash: "from-warning/[0.14]",
            ring: "border-warning/40",
          }
        : {
            key: "Within free storage",
            icon: CheckCircle2,
            text: "text-success",
            wash: "from-success/[0.10]",
            ring: "border-success/30",
          };

  const money = (usd: number) => formatShillings(usd, rate);

  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border bg-card bg-gradient-to-br to-transparent",
        tone.wash,
        tone.ring,
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <h2 className="flex items-center gap-2 font-display font-semibold">
          <tone.icon className={cn("h-4 w-4", tone.text)} />
          {t(locale, "Storage status")}
        </h2>
        <span className={cn("text-xs font-semibold uppercase tracking-wide", tone.text)}>
          {t(locale, tone.key)}
        </span>
      </div>

      {/* The five figures, in the order the question is asked. */}
      <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-5">
        {[
          {
            k: "In warehouse",
            v: `${status.daysInWarehouse} ${t(locale, status.daysInWarehouse === 1 ? "day" : "days")}`,
          },
          { k: "Free storage", v: `${status.freeDays} ${t(locale, "days")}` },
          {
            k: "Overdue",
            v:
              status.chargeableDays > 0
                ? `${status.chargeableDays} ${t(locale, status.chargeableDays === 1 ? "day" : "days")}`
                : "—",
            tone: status.chargeableDays > 0 ? "text-destructive" : undefined,
          },
          {
            k: "Rate",
            v: `USD ${STORAGE_POLICY.perDayUsd}/${t(locale, "day")}`,
          },
          {
            k: "Storage fee",
            v: money(status.chargeUsd),
            tone: status.chargeUsd > 0 ? "text-destructive" : "text-success",
            strong: true,
          },
        ].map((cell) => (
          <div key={cell.k} className="bg-card px-4 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t(locale, cell.k)}
            </dt>
            <dd
              className={cn(
                "mt-0.5 whitespace-nowrap font-display font-bold tabular-nums",
                cell.strong ? "text-base" : "text-sm",
                cell.tone
              )}
            >
              {cell.v}
            </dd>
          </div>
        ))}
      </dl>

      <p className="px-5 py-2.5 text-xs text-muted-foreground">
        {t(locale, "Arrived in Dar")} {formatDate(status.arrivedAt, locale)} ·{" "}
        {status.collected
          ? t(locale, "collected, so the clock has stopped")
          : status.expired
            ? `${status.chargeableDays} × USD ${STORAGE_POLICY.perDayUsd} = ${money(status.chargeUsd)}`
            : `${status.freeDaysRemaining} ${t(locale, status.freeDaysRemaining === 1 ? "free day left" : "free days left")}`}
      </p>

      {/* Charge it, or forgive it on the record. Finance only. */}
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
