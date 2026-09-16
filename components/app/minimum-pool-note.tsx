import { Scale } from "lucide-react";

import { t } from "@/lib/i18n";
import type { Locale } from "@/lib/locale";
import type { PoolShare } from "@/lib/minimum-pool";

/**
 * WHY THIS BILL SAYS WHAT IT SAYS, WHEN THE CUSTOMER'S PARCELS SHARE A MINIMUM.
 *
 * Madina lands 0.1 kg and 0.8 kg on one flight. The route will not bill under
 * 1 kg, and that minimum belongs to her cargo on that aircraft rather than to
 * each parcel — so one bill carries USD 13.50 and the other carries nothing.
 * Both figures are right and neither explains itself: a bill of zero with no
 * working on it reads as a fault, and the desk rings Finance about it.
 *
 * So the arithmetic is printed. Every parcel and its weight, what they come to
 * together, what that is billed as, and the rate — the owner's own table. A
 * reader can check the total instead of taking it on trust, and the customer
 * asking "why am I charged for a kilo" is answered on the page they are
 * holding.
 *
 * Shown on BOTH sides of the pool. The bill carrying the charge has to say it
 * covers the others, or it reads as an overcharge on one small parcel.
 */
export function MinimumPoolNote({
  share,
  thisTracking,
  locale,
  className,
}: {
  share: PoolShare;
  /** The consignment whose page this is, so its own row can be marked. */
  thisTracking: string;
  locale: Locale;
  className?: string;
}) {
  const kg = (n: number) => `${n} ${t(locale, "kg")}`;
  const money = (n: number) => `${share.currency} ${n.toFixed(2)}`;
  /* The minimum only lifted the weight where the parcels together fall under
     it. Above it they are billed on what they actually weigh, and saying
     "minimum applied" there would be a lie. */
  const liftedByMinimum = share.billableKg > share.combinedKg + 0.0005;

  return (
    <div className={`rounded-xl border bg-muted/30 p-4 ${className ?? ""}`}>
      <p className="flex items-center gap-1.5 text-sm font-semibold">
        <Scale className="h-4 w-4 text-brand" />
        {t(locale, "Charged once for this flight")}
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {liftedByMinimum
          ? t(
              locale,
              "These parcels travelled together and together they weigh less than the route's minimum, so the minimum is charged once across all of them — not once for each."
            )
          : t(
              locale,
              "These parcels travelled together and are billed on what they weigh together, on one of the bills."
            )}
      </p>

      <table className="mt-3 w-full text-[13px]">
        <tbody>
          {share.members.map((m) => (
            <tr key={m.trackingNumber} className="border-b last:border-0">
              <td className="py-1.5">
                <span className="font-mono">{m.trackingNumber}</span>
                {m.trackingNumber === thisTracking ? (
                  <span className="ml-1.5 text-[11px] text-muted-foreground">
                    {t(locale, "(this one)")}
                  </span>
                ) : null}
              </td>
              <td className="py-1.5 text-right font-mono tabular-nums">
                {kg(m.weightKg)}
              </td>
            </tr>
          ))}
          <tr className="border-b">
            <td className="py-1.5 text-muted-foreground">
              {t(locale, "Actual total")}
            </td>
            <td className="py-1.5 text-right font-mono tabular-nums">
              {kg(share.combinedKg)}
            </td>
          </tr>
          <tr className="border-b">
            <td className="py-1.5 font-medium">
              {t(locale, "Billable weight")}
              {liftedByMinimum ? (
                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                  {t(locale, "route minimum")} {kg(share.minimumKg)}
                </span>
              ) : null}
            </td>
            <td className="py-1.5 text-right font-mono font-semibold tabular-nums">
              {kg(share.billableKg)}
            </td>
          </tr>
          <tr className="border-b">
            <td className="py-1.5 text-muted-foreground">{t(locale, "Rate")}</td>
            <td className="py-1.5 text-right font-mono tabular-nums">
              {money(share.rate)}/{t(locale, "kg")}
            </td>
          </tr>
          <tr>
            <td className="py-1.5 font-semibold">{t(locale, "Total due")}</td>
            <td className="py-1.5 text-right font-mono font-semibold tabular-nums">
              {money(share.pooledFreight)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Which bill actually asks for it. Without this the reader knows the
          figure and not where to pay it. */}
      <p className="mt-2 text-xs text-muted-foreground">
        {share.carries
          ? t(locale, "Charged on this bill, covering all the cargo above.")
          : `${t(locale, "Charged on")} ${share.carrierTracking}, ${t(locale, "so this bill asks for nothing.")}`}
      </p>
    </div>
  );
}
