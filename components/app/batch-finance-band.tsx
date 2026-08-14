import {
  TriangleAlert,
} from "lucide-react";

import type { BatchFinance } from "@/lib/batch-finance";
import { formatLocal, formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer";

/**
 * What this batch is worth, above everything else on the page.
 *
 * The owner's rule: Finance opens a dispatch to answer a money question, so
 * the money answer comes before the cargo detail rather than after it.
 *
 * Two honesty rules run through this panel. Cargo that has been invoiced
 * contributes the figure Finance confirmed; cargo that has not is priced from
 * the rate book and is labelled an estimate, in the subtext and again in the
 * footer — a number that might move must never look like one that cannot.
 * And outstanding counts only what has actually been billed: nobody owes money
 * against an estimate, so rolling estimates into a debt figure would invent a
 * receivable that no customer has ever been shown.
 */
export async function BatchFinanceBand({ finance }: { finance: BatchFinance }) {
  const locale = await viewerLocale();
  const {
    expectedUsd,
    expectedTzs,
    estimatedUsd,
    invoicedUsd,
    billedUsd,
    drafts,
    rate,
    customers,
    weightKg,
    invoiced,
    pieces,
    receivedUsd,
    outstandingUsd,
    unpriceable,
    expensesUsd,
    expensesTzs,
    expenseCount,
    netProfitUsd,
    marginPct,
    atALoss,
  } = finance;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gradient-to-br from-brand/5 to-transparent px-5 py-4">
        <h2 className="font-display font-semibold">
          {t(locale, "Financial overview")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t(
            locale,
            "Collected and Expenses are money that has actually moved. The rest is what this batch is expected to be worth once everyone pays."
          )}
        </p>
      </div>

      {/*
        The six figures, before any of the detail.

        Named for what they actually are. Revenue here is what has been BILLED,
        not banked, so it is expected revenue — and every figure derived from it
        is expected too. Only Collected and Expenses describe money that has
        really moved. Calling a billed figure "revenue" and a billed-minus-costs
        figure "net profit" is how a batch reads as a good one months before
        anybody has paid for it.
      */}
      <dl className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-3 lg:grid-cols-6">
        {[
          { k: t(locale, "Expected revenue"), usd: billedUsd, tone: "" },
          { k: t(locale, "Collected"), usd: receivedUsd, tone: "text-success" },
          {
            k: t(locale, "Outstanding"),
            usd: outstandingUsd,
            tone: outstandingUsd > 0 ? "text-destructive" : "",
          },
          { k: t(locale, "Expenses"), usd: expensesUsd, tsh: expensesTzs, tone: "" },
          {
            k: atALoss ? t(locale, "Expected loss") : t(locale, "Expected profit"),
            usd: Math.abs(netProfitUsd),
            tone: atALoss ? "text-destructive" : "text-success",
          },
          {
            k: t(locale, "Expected margin"),
            // No margin rather than a zero: a batch that has billed nothing
            // has not made 0%, it has no answer yet.
            percent: marginPct === null ? "—" : `${Math.round(marginPct)}%`,
            tone: atALoss ? "text-destructive" : "",
          },
        ].map((cell) => (
          <div key={cell.k} className="bg-card px-5 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {cell.k}
            </dt>
            {/*
              Shillings lead, dollars underneath.

              The office quotes, pays and banks in shillings all day; the dollar
              figure is what the invoice says. Putting the dollar first made
              every reader do the conversion in their head before the number
              meant anything.
            */}
            <dd className={`mt-0.5 font-display text-base font-bold tabular-nums ${cell.tone}`}>
              {cell.percent ??
                (cell.tsh !== undefined && cell.tsh !== null
                  ? formatLocal(cell.tsh)
                  : rate === null
                    ? formatUsd(cell.usd!)
                    : formatLocal(cell.usd! * rate))}
            </dd>
            {cell.percent === undefined && rate !== null ? (
              <p className="text-[11px] tabular-nums text-muted-foreground">
                {formatUsd(cell.usd!)}
              </p>
            ) : null}
          </div>
        ))}
      </dl>

      {/*
        One line of context, not eight tiles.

        The strip above already answers revenue, collected, outstanding,
        expenses, profit and margin. The tiles that used to sit here answered
        four of those a second time, in a different unit, which is how a panel
        ends up the height of a screen while saying one thing twice. What is
        left is only what the strip cannot say.
      */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t px-5 py-2.5 text-xs text-muted-foreground">
        <span>
          {pieces.toLocaleString()}{" "}
          {t(locale, pieces === 1 ? "piece of cargo" : "pieces of cargo")}
        </span>
        <span>
          {customers.toLocaleString()}{" "}
          {t(locale, customers === 1 ? "customer" : "customers")}
        </span>
        <span>{weightKg.toFixed(1)} kg</span>
        <span>
          {invoiced} {t(locale, "of")} {pieces} {t(locale, "invoiced")}
          {drafts > 0 ? (
            <span className="text-signal">
              {" "}
              · {drafts} {t(locale, "still a draft")}
            </span>
          ) : null}
        </span>
        {rate !== null ? (
          <span className="ml-auto">
            1 USD = {rate.toLocaleString()} TSh
          </span>
        ) : (
          <span className="ml-auto text-signal">
            {t(locale, "No exchange rate published yet")}
          </span>
        )}
      </div>

      {estimatedUsd > 0 || unpriceable.length > 0 ? (
        <div className="space-y-1 border-t bg-muted/30 px-5 py-3">
          {estimatedUsd > 0 ? (
            <p className="text-xs text-muted-foreground">
              {t(
                locale,
                "Cargo with no invoice yet is priced from the published rate book, including storage already accrued. Those figures move until Finance confirms them."
              )}
            </p>
          ) : null}
          {unpriceable.length > 0 ? (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {unpriceable.length}{" "}
                {t(
                  locale,
                  unpriceable.length === 1
                    ? "piece cannot be priced yet and is missing from the figures above —"
                    : "pieces cannot be priced yet and are missing from the figures above —"
                )}{" "}
                {unpriceable
                  .slice(0, 3)
                  .map((u) => u.trackingNumber)
                  .join(", ")}
                {unpriceable.length > 3 ? ` ${t(locale, "and others")}` : ""}
                {t(
                  locale,
                  ". Publish a rate for that cargo and the total will complete itself."
                )}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
