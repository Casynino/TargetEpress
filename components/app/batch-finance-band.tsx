import {
  Plane,
  Banknote,
  Coins,
  ReceiptText,
  Scale,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";

import type { BatchFinance } from "@/lib/batch-finance";
import { formatLocal, formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer";

/**
 * What this flight is worth, above everything else on the page.
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

  const tiles = [
    {
      icon: Wallet,
      label: t(locale, "Expected revenue"),
      value:
        expectedTzs === null ? formatUsd(expectedUsd) : formatLocal(expectedTzs),
      sub:
        estimatedUsd > 0
          ? `${formatUsd(invoicedUsd)} ${t(locale, "invoiced")} · ${formatUsd(estimatedUsd)} ${t(locale, "estimated")}`
          : t(locale, "All of it invoiced"),
      tone: "brand" as const,
    },
    {
      icon: Coins,
      label: t(locale, "Expected revenue (USD)"),
      value: formatUsd(expectedUsd),
      sub:
        expectedTzs === null
          ? t(locale, "No exchange rate published yet")
          : `${t(locale, "Estimate converted at")} ${rate?.toLocaleString()}`,
      tone: "brand" as const,
    },
    {
      icon: Users,
      label: t(locale, "Total customers"),
      value: customers.toLocaleString(),
      sub: `${pieces.toLocaleString()} ${t(locale, pieces === 1 ? "piece of cargo" : "pieces of cargo")}`,
      tone: "muted" as const,
    },
    {
      icon: Scale,
      label: t(locale, "Total cargo weight"),
      value: `${weightKg.toFixed(1)} kg`,
      sub: t(locale, "As declared on the manifest"),
      tone: "muted" as const,
    },
    {
      icon: ReceiptText,
      label: t(locale, "Invoices generated"),
      value: `${invoiced}${t(locale, " of ")}${pieces}`,
      // "Generated" and "confirmed" are different questions and the desk needs
      // both: 86 of 87 raised, 84 of those still waiting on a signature.
      sub:
        drafts > 0
          ? `${drafts} ${t(locale, "still a draft")}`
          : invoiced === pieces
            ? t(locale, "Every piece billed and confirmed")
            : `${pieces - invoiced} ${t(locale, "still to bill")}`,
      tone:
        drafts > 0
          ? ("signal" as const)
          : invoiced === pieces
            ? ("success" as const)
            : ("warning" as const),
    },
    {
      icon: Banknote,
      label: t(locale, "Payments received"),
      value: rate === null ? formatUsd(receivedUsd) : formatLocal(receivedUsd * rate),
      // Against confirmed bills, not drafts. A dispatch where 84 of 86 figures
      // are still drafts has barely billed anything, and dividing by the
      // drafts too would report 0% of a number nobody has been asked for.
      sub:
        billedUsd > 0
          ? `${Math.round((receivedUsd / billedUsd) * 100)}${t(locale, "% of what has been billed")}`
          : t(locale, "Nothing billed yet"),
      tone: "success" as const,
    },
    {
      icon: Wallet,
      label: t(locale, "Outstanding balance"),
      value:
        rate === null ? formatUsd(outstandingUsd) : formatLocal(outstandingUsd * rate),
      sub:
        outstandingUsd > 0
          ? t(locale, "Billed and not yet paid")
          : t(locale, "Nothing billed is unpaid"),
      tone: outstandingUsd > 0 ? ("danger" as const) : ("success" as const),
    },
    {
      icon: Plane,
      label: t(locale, "Cost of this flight"),
      // The per-row sum, so this agrees with the panel that lists them.
      value:
        expensesTzs === null ? formatUsd(expensesUsd) : formatLocal(expensesTzs),
      // A flight with no costs recorded is not a free flight. Saying so is the
      // difference between a profit figure and a number that merely looks like
      // one — customs and clearing are always paid, so a zero here means
      // nobody has written them down yet.
      sub:
        expenseCount > 0
          ? `${expenseCount} ${t(locale, expenseCount === 1 ? "cost recorded" : "costs recorded")}`
          : t(locale, "No costs recorded — profit below is not final"),
      tone: expenseCount > 0 ? ("warning" as const) : ("signal" as const),
    },
  ];

  const TONE: Record<string, string> = {
    brand: "text-brand",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    signal: "text-signal",
    muted: "text-muted-foreground",
  };

  return (
    <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gradient-to-br from-brand/5 to-transparent px-5 py-4">
        <h2 className="font-display font-semibold">
          {t(locale, "Financial overview")}
        </h2>
        <p className="text-xs text-muted-foreground">
          {t(
            locale,
            "What this dispatch is worth, and how much of it has been collected"
          )}
        </p>
      </div>

      {/*
        The six figures, before any of the detail.

        Finance should be able to tell in one glance whether this flight made
        money. Everything below this strip explains how; this is the answer.
      */}
      <dl className="grid grid-cols-2 gap-px border-b bg-border sm:grid-cols-3 lg:grid-cols-6">
        {[
          { k: t(locale, "Revenue"), usd: billedUsd, tone: "" },
          { k: t(locale, "Collected"), usd: receivedUsd, tone: "text-success" },
          {
            k: t(locale, "Outstanding"),
            usd: outstandingUsd,
            tone: outstandingUsd > 0 ? "text-destructive" : "",
          },
          { k: t(locale, "Expenses"), usd: expensesUsd, tsh: expensesTzs, tone: "" },
          {
            k: atALoss ? t(locale, "Net loss") : t(locale, "Net profit"),
            usd: Math.abs(netProfitUsd),
            tone: atALoss ? "text-destructive" : "text-success",
          },
          {
            k: t(locale, "Margin"),
            // No margin rather than a zero: a flight that has billed nothing
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

      <dl className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="bg-card p-4">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <tile.icon className={`h-3.5 w-3.5 ${TONE[tile.tone]}`} />
              {tile.label}
            </dt>
            <dd className="mt-1 font-display text-lg font-bold tabular-nums">
              {tile.value}
            </dd>
            <p className="mt-0.5 text-xs text-muted-foreground">{tile.sub}</p>
          </div>
        ))}
      </dl>

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
