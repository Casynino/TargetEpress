import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer";

export type FlightProfit = {
  id: string;
  batchNumber: string;
  status: string;
  revenue: number;
  collected: number;
  outstanding: number;
  costs: number;
  profit: number;
  margin: number | null;
  unconfirmed: number;
  hasCosts: boolean;
};

/**
 * Every recent flight, and whether it made money.
 *
 * The company earns per dispatch, so this is the row the business is actually
 * run on: what it billed, how much has come back, what it cost to move, and
 * what is left. A month-level profit figure cannot tell you that the Guangzhou
 * flight paid for itself and the Hong Kong one did not.
 *
 * Two honesty markers, because a profit figure is only as good as what is
 * behind it. A flight with no costs recorded is flagged rather than shown as
 * pure profit — customs and clearing are always paid, so a zero means nobody
 * has written them down. And a flight still carrying draft prices is flagged
 * too, because its revenue will move.
 */
export async function FlightProfitTable({ flights }: { flights: FlightProfit[] }) {
  const locale = await viewerLocale();

  if (flights.length === 0) {
    return (
      <section className="panel p-5">
        <h2 className="font-display font-semibold">{t(locale, "Flights")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(locale, "No dispatches have flown yet.")}
        </p>
      </section>
    );
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
        <h2 className="font-display font-semibold">
          {t(locale, "What each flight made")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t(locale, "Billed, collected, and what it cost to move")}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2 font-medium">{t(locale, "Flight")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Revenue")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Collected")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Outstanding")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Expenses")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Net profit")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Margin")}</th>
            </tr>
          </thead>
          <tbody>
            {flights.map((f) => {
              const loss = f.profit < 0;
              return (
                <tr key={f.id} className="border-b last:border-0">
                  <td className="px-5 py-2.5">
                    <Link
                      href={`/app/shipments/${f.id}`}
                      className="font-medium hover:underline"
                    >
                      {f.batchNumber}
                    </Link>
                    {/* The two reasons a figure on this row might move. */}
                    {!f.hasCosts ? (
                      <span className="ml-2 inline-flex items-center gap-1 rounded bg-signal/10 px-1.5 py-0.5 text-[11px] text-signal">
                        <TriangleAlert className="h-3 w-3" />
                        {t(locale, "no costs recorded")}
                      </span>
                    ) : null}
                    {f.unconfirmed > 0 ? (
                      <span className="ml-2 rounded bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">
                        {f.unconfirmed} {t(locale, "still a draft")}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatUsd(f.revenue)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-success">
                    {formatUsd(f.collected)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right tabular-nums ${
                      f.outstanding > 0 ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {formatUsd(f.outstanding)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                    {formatUsd(f.costs)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                      loss ? "text-destructive" : "text-success"
                    }`}
                  >
                    {loss ? `(${formatUsd(Math.abs(f.profit))})` : formatUsd(f.profit)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {/* Nothing billed means no margin yet, not a margin of zero. */}
                    {f.margin === null ? "—" : `${Math.round(f.margin)}%`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
