import {
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
export function BatchFinanceBand({ finance }: { finance: BatchFinance }) {
  const {
    expectedUsd,
    expectedTzs,
    estimatedUsd,
    invoicedUsd,
    rate,
    customers,
    weightKg,
    invoiced,
    pieces,
    receivedUsd,
    outstandingUsd,
    unpriceable,
  } = finance;

  const tiles = [
    {
      icon: Wallet,
      label: "Expected revenue (USD)",
      value: formatUsd(expectedUsd),
      sub:
        estimatedUsd > 0
          ? `${formatUsd(invoicedUsd)} invoiced · ${formatUsd(estimatedUsd)} estimated`
          : "All of it invoiced",
      tone: "brand" as const,
    },
    {
      icon: Coins,
      label: "Expected revenue (TZS)",
      value: expectedTzs === null ? "—" : formatLocal(expectedTzs),
      sub:
        expectedTzs === null
          ? "No exchange rate published yet"
          : `Estimate converted at ${rate?.toLocaleString()}`,
      tone: "brand" as const,
    },
    {
      icon: Users,
      label: "Total customers",
      value: customers.toLocaleString(),
      sub: `${pieces.toLocaleString()} piece${pieces === 1 ? "" : "s"} of cargo`,
      tone: "muted" as const,
    },
    {
      icon: Scale,
      label: "Total cargo weight",
      value: `${weightKg.toFixed(1)} kg`,
      sub: "As declared on the manifest",
      tone: "muted" as const,
    },
    {
      icon: ReceiptText,
      label: "Invoices generated",
      value: `${invoiced} of ${pieces}`,
      sub:
        invoiced === pieces
          ? "Every piece billed"
          : `${pieces - invoiced} still to bill`,
      tone: invoiced === pieces ? ("success" as const) : ("warning" as const),
    },
    {
      icon: Banknote,
      label: "Payments received",
      value: formatUsd(receivedUsd),
      sub:
        invoicedUsd > 0
          ? `${Math.round((receivedUsd / invoicedUsd) * 100)}% of what is billed`
          : "Nothing billed yet",
      tone: "success" as const,
    },
    {
      icon: Wallet,
      label: "Outstanding balance",
      value: formatUsd(outstandingUsd),
      sub:
        outstandingUsd > 0
          ? "Billed and not yet paid"
          : "Nothing billed is unpaid",
      tone: outstandingUsd > 0 ? ("danger" as const) : ("success" as const),
    },
  ];

  const TONE: Record<string, string> = {
    brand: "text-brand",
    success: "text-success",
    warning: "text-warning",
    danger: "text-destructive",
    muted: "text-muted-foreground",
  };

  return (
    <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-gradient-to-br from-brand/5 to-transparent px-5 py-4">
        <h2 className="font-display font-semibold">Financial overview</h2>
        <p className="text-xs text-muted-foreground">
          What this dispatch is worth, and how much of it has been collected
        </p>
      </div>

      <dl className="grid gap-px bg-border sm:grid-cols-2 lg:grid-cols-4">
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
        {/* Seven tiles into a two- or four-column grid leaves one cell empty at
            both breakpoints, and the gap-px trick renders that as a slab of
            border colour. This fills it with the panel. */}
        <div className="hidden bg-card sm:block" aria-hidden />
      </dl>

      {estimatedUsd > 0 || unpriceable.length > 0 ? (
        <div className="space-y-1 border-t bg-muted/30 px-5 py-3">
          {estimatedUsd > 0 ? (
            <p className="text-xs text-muted-foreground">
              Cargo with no invoice yet is priced from the published rate book,
              including storage already accrued. Those figures move until
              Finance confirms them.
            </p>
          ) : null}
          {unpriceable.length > 0 ? (
            <p className="flex items-start gap-1.5 text-xs text-warning">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>
                {unpriceable.length} piece
                {unpriceable.length === 1 ? "" : "s"} cannot be priced yet and
                {unpriceable.length === 1 ? " is" : " are"} missing from the
                figures above —{" "}
                {unpriceable
                  .slice(0, 3)
                  .map((u) => u.trackingNumber)
                  .join(", ")}
                {unpriceable.length > 3 ? " and others" : ""}. Publish a rate
                for that cargo and the total will complete itself.
              </span>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
