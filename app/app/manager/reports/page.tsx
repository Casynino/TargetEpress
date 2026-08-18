import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, Plane, Truck, Wallet } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { SectionLabel } from "@/components/app/section-label";
import { creditForPeriod } from "@/lib/credit-queries";
import { toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { formatShillings } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { profitAndLoss, windowFor, type PeriodKey } from "@/lib/profit";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Management report" };

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
];

/**
 * One period, one page, ready to be printed and handed over.
 *
 * The Profit & loss screen already answers the money question in full detail
 * and this does not repeat it. What it does instead is put the three things
 * beside each other that a manager is asked about in the same breath and
 * currently has to open three screens to answer: what the company MOVED, what
 * that EARNED, and how much of the earning is still a promise rather than money.
 *
 * The third column is the one that changes the reading. A month can bill well,
 * profit on paper, and leave the bank emptier than it started, and the only way
 * to see that is to have the credit figure on the same sheet as the revenue.
 */
export default async function ManagerReport({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requirePermission("report.view");
  const locale = await viewerLocale();
  const { period } = await searchParams;

  const picked = windowFor(period ?? "month", locale);
  const range = { gte: picked.window.from, lt: picked.window.to };

  const [pl, previous, credit, registered, delivered, dispatched, rateRow] =
    await Promise.all([
      profitAndLoss(picked.window),
      profitAndLoss(picked.previous),
      creditForPeriod(picked.window),
      prisma.shipment.count({ where: { registeredAt: range, deletedAt: null } }),
      prisma.shipment.count({ where: { deliveredAt: range, deletedAt: null } }),
      prisma.batch.count({ where: { departedAt: range } }),
      currentRate(),
    ]);

  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const money = (n: number) => formatShillings(n, rate);

  /* Against the period before it, because a figure with nothing beside it is
     not a finding. Undefined where the previous period had none — see
     percentDelta: "+∞%" would be a sentence the data does not support. */
  const change = (now: number, before: number) =>
    before > 0 ? ((now - before) / before) * 100 : null;

  const rows: {
    label: string;
    value: string;
    sub?: string;
    delta?: number | null;
    tone?: "good" | "bad";
  }[] = [
    {
      label: "Billed",
      value: money(pl.revenue),
      sub: `${pl.invoices} ${t(locale, "confirmed bills")}`,
      delta: change(pl.revenue, previous.revenue),
    },
    {
      label: "Of that, cash",
      value: money(pl.cashRevenue),
      sub: t(locale, "Paid at the counter"),
    },
    {
      label: "Of that, credit",
      value: money(pl.creditRevenue),
      sub: t(locale, "Released against a promise"),
      tone: pl.creditRevenue > pl.cashRevenue ? "bad" : undefined,
    },
    {
      label: "Operating costs",
      value: money(pl.costs),
      delta: change(pl.costs, previous.costs),
    },
    {
      label: "Profit",
      value: money(pl.profit),
      sub:
        pl.revenue > 0
          ? `${((pl.profit / pl.revenue) * 100).toFixed(0)}% ${t(locale, "margin")}`
          : undefined,
      delta: change(pl.profit, previous.profit),
      tone: pl.profit < 0 ? "bad" : "good",
    },
  ];

  return (
    <>
      <PageHeader
        title={t(locale, "Management report")}
        description={t(
          locale,
          "What moved, what it earned, and how much of it is still owed."
        )}
        actions={<PrintButton label={t(locale, "Print")} />}
      />

      {/* The period, as links rather than a form: this page is often printed,
          and a printed report has to say which period it covers. */}
      <div className="mb-4 flex flex-wrap gap-1.5 print:hidden">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/app/manager/reports?period=${p.key}`}
            className={
              picked.key === p.key
                ? "focus-ring rounded-full bg-foreground px-3 py-1 text-[11px] font-semibold text-background"
                : "focus-ring rounded-full border px-3 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            }
          >
            {t(locale, p.label)}
          </Link>
        ))}
      </div>

      <p className="mb-5 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
        {t(locale, "Covering")} {picked.window.from.toLocaleDateString("en-GB")} —{" "}
        {new Date(picked.window.to.getTime() - 1).toLocaleDateString("en-GB")}
      </p>

      <SectionLabel>{t(locale, "What moved")}</SectionLabel>
      <div className="mb-6 grid grid-cols-3 gap-2">
        {[
          { icon: Boxes, label: "Cargo registered", value: registered },
          { icon: Plane, label: "Batches flown", value: dispatched },
          { icon: Truck, label: "Delivered", value: delivered },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border bg-card p-3">
            <s.icon className="h-4 w-4 text-muted-foreground" />
            <p className="tabular mt-2 text-xl font-semibold">{s.value}</p>
            <p className="text-[11px] text-muted-foreground">{t(locale, s.label)}</p>
          </div>
        ))}
      </div>

      <SectionLabel>{t(locale, "What it earned")}</SectionLabel>
      <div className="mb-6 divide-y rounded-xl border bg-card">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline gap-3 px-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t(locale, r.label)}</span>
              {r.sub ? (
                <span className="block text-[11px] text-muted-foreground">{r.sub}</span>
              ) : null}
            </span>
            {r.delta !== null && r.delta !== undefined ? (
              <span
                className={
                  r.delta >= 0
                    ? "tabular shrink-0 text-[11px] text-success"
                    : "tabular shrink-0 text-[11px] text-destructive"
                }
              >
                {r.delta >= 0 ? "+" : ""}
                {r.delta.toFixed(0)}%
              </span>
            ) : null}
            <span
              className={
                r.tone === "bad"
                  ? "tabular shrink-0 text-sm font-semibold text-destructive"
                  : r.tone === "good"
                    ? "tabular shrink-0 text-sm font-semibold text-success"
                    : "tabular shrink-0 text-sm font-semibold"
              }
            >
              {r.value}
            </span>
          </div>
        ))}
      </div>

      {/* Deliberately last and deliberately separate. Everything above can look
          healthy while this says the money never arrived. */}
      <SectionLabel action={{ href: "/app/finance/credit", label: t(locale, "Open credit") }}>
        {t(locale, "What is still owed")}
      </SectionLabel>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { label: "Billed on credit", value: money(credit.billedUsd), tone: "" },
          { label: "Collected since", value: money(credit.collectedUsd), tone: "text-success" },
          { label: "Still owed", value: money(credit.outstandingUsd), tone: "text-warning" },
          { label: "Overdue", value: money(credit.overdueUsd), tone: "text-destructive" },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border bg-card p-3">
            <p className={`tabular text-sm font-semibold ${c.tone}`}>{c.value}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t(locale, c.label)}</p>
          </div>
        ))}
      </div>

      {credit.collectionRate !== null ? (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Wallet className="h-3.5 w-3.5" />
          {credit.collectionRate.toFixed(0)}%{" "}
          {t(locale, "of the credit given in this period has come back in.")}
        </p>
      ) : null}
    </>
  );
}
