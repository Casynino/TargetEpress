import type { Metadata } from "next";
import { Lock } from "lucide-react";

import { ExchangeRateForm } from "@/components/app/exchange-rate-form";
import { PageHeader } from "@/components/app/page-header";
import { toNumber } from "@/lib/format";
import { currentRate, rateHistory } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Exchange rate" };

export default async function ExchangeRatePage() {
  await requirePermission("fx.manage");

  const [rate, history, invoicesAtOtherRates] = await Promise.all([
    currentRate(),
    rateHistory(25),
    // Proof that the lock works, in numbers: invoices still carrying a rate
    // other than today's.
    prisma.invoice.groupBy({
      by: ["exchangeRate"],
      where: { exchangeRate: { not: null } },
      _count: { _all: true },
      orderBy: { exchangeRate: "desc" },
    }),
  ]);

  const live = rate ? toNumber(rate.rate) : null;

  return (
    <>
      <PageHeader
        title="Exchange rate"
        description="Prices are set in US dollars. This is what a dollar is worth in shillings today."
      />

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5 shadow-soft">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              In force now
            </p>
            {live === null ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No rate published yet. Invoices will show US dollars only until
                you set one.
              </p>
            ) : (
              <>
                <p className="mt-1 font-display text-3xl font-bold tabular-nums">
                  {live.toLocaleString()}
                  <span className="ml-2 text-base font-medium text-muted-foreground">
                    TZS / USD
                  </span>
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Set{" "}
                  {rate!.effectiveFrom.toLocaleDateString("en-GB", {
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                  {rate!.setBy?.name ? ` by ${rate!.setBy.name}` : ""}.
                </p>
              </>
            )}
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-soft">
            <h2 className="font-semibold">Publish a new rate</h2>
            <p className="mb-4 mt-1 text-sm text-muted-foreground">
              Applies to invoices raised from now on.
            </p>
            <ExchangeRateForm current={live} />
          </section>
        </div>

        <div className="space-y-6">
          <section className="flex items-start gap-3 rounded-xl border bg-card p-4 shadow-soft">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">Old invoices never move</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Every invoice stores the rate it was raised at. A customer quoted
                TZS 202,500 in June still owes TZS 202,500 today, whatever the
                shilling has done since.
              </p>
              {invoicesAtOtherRates.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2 text-xs">
                  {invoicesAtOtherRates.map((group) => {
                    const groupRate = group.exchangeRate
                      ? toNumber(group.exchangeRate)
                      : null;
                    return (
                      <span
                        key={String(group.exchangeRate)}
                        className={`rounded-full border px-2.5 py-1 ${
                          groupRate === live
                            ? "border-success/40 bg-success/5 text-success"
                            : "text-muted-foreground"
                        }`}
                      >
                        {group._count._all} invoice
                        {group._count._all === 1 ? "" : "s"} at{" "}
                        {groupRate?.toLocaleString()}
                        {groupRate === live ? " (current)" : ""}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border bg-card shadow-soft">
            <header className="border-b p-4">
              <h2 className="font-semibold">Rate history</h2>
              <p className="text-sm text-muted-foreground">
                A rate is never edited — each change is a new entry.
              </p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="p-3 font-medium">Rate</th>
                    <th className="p-3 font-medium">Effective</th>
                    <th className="hidden p-3 font-medium sm:table-cell">Set by</th>
                    <th className="hidden p-3 font-medium md:table-cell">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((entry, index) => {
                    const entryRate = toNumber(entry.rate);
                    const previous = history[index + 1]
                      ? toNumber(history[index + 1].rate)
                      : null;
                    const delta =
                      previous === null ? null : ((entryRate - previous) / previous) * 100;
                    return (
                      <tr key={entry.id} className="border-t">
                        <td className="p-3 font-mono font-medium tabular-nums">
                          {entryRate.toLocaleString()}
                          {delta !== null && Math.abs(delta) >= 0.01 ? (
                            <span
                              className={`ml-2 text-xs ${
                                delta > 0 ? "text-success" : "text-destructive"
                              }`}
                            >
                              {delta > 0 ? "+" : ""}
                              {delta.toFixed(2)}%
                            </span>
                          ) : null}
                        </td>
                        <td className="p-3 whitespace-nowrap text-muted-foreground">
                          {entry.effectiveFrom.toLocaleDateString("en-GB", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                          })}
                          {index === 0 ? (
                            <span className="ml-2 text-xs font-medium text-success">
                              current
                            </span>
                          ) : null}
                        </td>
                        <td className="hidden p-3 text-muted-foreground sm:table-cell">
                          {entry.setBy?.name ?? "System"}
                        </td>
                        <td className="hidden p-3 text-muted-foreground md:table-cell">
                          {entry.notes ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
