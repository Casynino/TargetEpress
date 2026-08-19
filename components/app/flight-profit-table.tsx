import Link from "next/link";
import { ChevronDown, TriangleAlert } from "lucide-react";

import { currentRateValue, formatShillings } from "@/lib/fx";
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
 * Every recent batch, and whether it is expected to make money.
 *
 * Revenue here is BILLED, not banked, so it and everything derived from it are
 * expectations — the labels say so. Collected is the only column describing
 * money the business actually holds.
 *
 * The company earns per batch, so this is the row the business is actually run
 * on: what it billed, how much has come back, what it cost to move, and what is
 * left. A month-level profit figure cannot tell you that the Guangzhou batch
 * paid for itself and the Hong Kong one did not.
 *
 * Two honesty markers, because a profit figure is only as good as what is
 * behind it. A batch with no costs recorded is flagged rather than shown as
 * pure profit — customs and clearing are always paid, so a zero means nobody
 * has written them down. And a flight still carrying draft prices is flagged
 * too, because its revenue will move.
 */
/*
  FIVE BATCHES, THEN IT SCROLLS.

  The owner: "this should carry only 5 batches... if we have more than 5 it
  should be like needs attention, it has to scroll and not use too much space."
  The business flies weekly, so this table grows on its own — left alone it
  would be the tallest thing on the home screen by Christmas, and it is a
  summary. The panel is now the same height whether there are two batches or
  twenty, exactly like the attention centre above it.

  Measured rather than guessed: a row is 41px, or 45px when it carries a flag
  like "no costs recorded", and the column header is 33px. 258px therefore
  holds the header plus five of the tallest rows — and when rows are the short
  kind a sixth peeks over the edge, which is the cue that there is more.

  The header is sticky inside the scroller: scrolling a money table whose
  column names have gone is how a reader mistakes Collected for Outstanding.
*/
const VISIBLE_ROWS = 5;

export async function FlightProfitTable({ flights }: { flights: FlightProfit[] }) {
  const locale = await viewerLocale();
  /* Shillings, like every other money figure on the boss's screen. The dollar
     amounts are what the invoices say, and the profit page keeps them one tap
     away — this table is the one he scans, so it speaks his currency. */
  const rate = await currentRateValue();
  const money = (usd: number) => formatShillings(usd, rate);
  const hidden = Math.max(0, flights.length - VISIBLE_ROWS);

  if (flights.length === 0) {
    return (
      <section className="panel p-5">
        <h2 className="font-display font-semibold">{t(locale, "Batches")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(locale, "No batches have flown yet.")}
        </p>
      </section>
    );
  }

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
        <h2 className="font-display font-semibold">
          {t(locale, "What each batch is making")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t(locale, "Billed against what it cost. Only Collected is money in the bank.")}
        </p>
      </div>

      {/* Seven money columns. `overflow-x-auto` kept them off the body's
          scrollbar but still asked the boss to drag a table sideways to find
          out whether a flight paid for itself; below md each batch becomes a
          card with its figures labelled. */}
      {/* 440px on a phone: two cards of 177px and a clear slice of the third.
          Five of them would be 885px — taller than the handset, which is the
          "too much space" the owner was pointing at. */}
      <ul className="max-h-[440px] divide-y overflow-y-auto md:hidden">
        {flights.map((f) => {
          const loss = f.profit < 0;
          return (
            <li key={f.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/app/shipments/${f.id}`}
                  className="focus-ring rounded font-medium hover:underline"
                >
                  {f.batchNumber}
                </Link>
                {!f.hasCosts ? (
                  <span className="inline-flex items-center gap-1 rounded bg-signal/10 px-1.5 py-0.5 text-[11px] text-signal">
                    <TriangleAlert className="h-3 w-3" />
                    {t(locale, "no costs recorded")}
                  </span>
                ) : null}
                {f.unconfirmed > 0 ? (
                  <span className="rounded bg-warning/10 px-1.5 py-0.5 text-[11px] text-warning">
                    {f.unconfirmed} {t(locale, "still a draft")}
                  </span>
                ) : null}
              </div>

              <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">
                    {t(locale, "Expected revenue")}
                  </dt>
                  <dd className="truncate tabular-nums">{money(f.revenue)}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">
                    {t(locale, "Collected")}
                  </dt>
                  <dd className="truncate tabular-nums text-success">
                    {money(f.collected)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">
                    {t(locale, "Outstanding")}
                  </dt>
                  <dd
                    className={`truncate tabular-nums ${
                      f.outstanding > 0
                        ? "text-destructive"
                        : "text-muted-foreground"
                    }`}
                  >
                    {money(f.outstanding)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">
                    {t(locale, "Expenses")}
                  </dt>
                  <dd className="truncate tabular-nums text-destructive">
                    {money(f.costs)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">
                    {t(locale, "Expected profit")}
                  </dt>
                  <dd
                    className={`truncate font-medium tabular-nums ${
                      loss ? "text-destructive" : ""
                    }`}
                  >
                    {loss ? `(${money(Math.abs(f.profit))})` : money(f.profit)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-xs text-muted-foreground">
                    {t(locale, "Expected margin")}
                  </dt>
                  <dd className="truncate tabular-nums">
                    {f.margin === null ? "—" : `${Math.round(f.margin)}%`}
                  </dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ul>

      <div className="hidden max-h-[258px] overflow-auto md:block">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-card">
            <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-5 py-2 font-medium">{t(locale, "Batch")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Expected revenue")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Collected")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Outstanding")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Expenses")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Expected profit")}</th>
              <th className="px-3 py-2 text-right font-medium">{t(locale, "Expected margin")}</th>
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
                    {money(f.revenue)}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-success">
                    {money(f.collected)}
                  </td>
                  <td
                    className={`px-3 py-2.5 text-right tabular-nums ${
                      f.outstanding > 0 ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    {money(f.outstanding)}
                  </td>
                  {/* Money out, in the same red as everywhere else it is
                      shown. A cost set in grey on the one screen that compares
                      batches is the column a reader skips. */}
                  <td className="px-3 py-2.5 text-right tabular-nums text-destructive">
                    {money(f.costs)}
                  </td>
                  {/* Green is reserved for money in the bank, which on this
                      row is Collected. An expected profit is set plain, and
                      turns red only when it has gone the other way. */}
                  <td
                    className={`px-3 py-2.5 text-right font-medium tabular-nums ${
                      loss ? "text-destructive" : ""
                    }`}
                  >
                    {loss ? `(${money(Math.abs(f.profit))})` : money(f.profit)}
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

      {/* Said out loud, because a scroll area with no edge showing looks like
          the whole list. The count is exact on the wide table, which shows five;
          the phone shows fewer cards in the same height, so it does not claim a
          number it cannot keep. */}
      {hidden > 0 ? (
        <p className="flex items-center justify-center gap-1.5 border-t px-4 py-1.5 text-xs text-muted-foreground">
          <ChevronDown className="h-3 w-3" />
          <span className="hidden md:inline">
            {t(locale, "scroll for")} {hidden} {t(locale, "more")}
          </span>
          <span className="md:hidden">{t(locale, "scroll for more")}</span>
        </p>
      ) : null}
    </section>
  );
}
