import type { Metadata } from "next";
import Link from "next/link";
import { Boxes, Download, FileText, Plane, Truck, Wallet } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { PrintButton } from "@/components/app/print-button";
import { SectionLabel } from "@/components/app/section-label";
import { creditForPeriod } from "@/lib/credit-queries";
import { percentDelta, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { formatShillings } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { volumeInWindow } from "@/lib/queries";
import { profitAndLoss, windowFor, type PeriodKey } from "@/lib/profit";
import { REPORTS, type ReportKey } from "@/lib/reports";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Management report" };

/* "Today" is here because the owner asked for a daily report and a daily report
   is this one over a one-day window — windowFor already knows the boundary and
   the download route reads the same key. A separate daily report would compute
   the same five figures a second way. */
const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "quarter", label: "This quarter" },
  { key: "year", label: "This year" },
];

/**
 * What each report answers, in one line.
 *
 * Navigation copy, not the report's caption. The caption is the sentence that
 * says what a figure EXCLUDES — drafts, write-offs, unpaid runs — and it is
 * already printed on the document by lib/report-pdf.ts and above the table on
 * the report screen. Showing the real one here would mean running all
 * twenty-five reports to render a list of links; hand-copying it would give the
 * exclusions a second wording to drift from. So this line says only enough to
 * pick the right report, and the document itself states the terms.
 */
const ASKS: Partial<Record<ReportKey, string>> = {
  "profit-loss": "Did the period make money once every cost is counted?",
  income: "What was billed, what was paid, what is still owed — bill by bill.",
  expenses: "Every cost recorded, what it was for and which account paid it.",
  "expense-by-category": "Where the money goes, grouped, biggest first.",
  "monthly-summary": "Month against month: billed, collected, spent, kept.",
  "cash-flow": "What came in, what went out, what is left.",
  "financial-statement": "Where the company stands: cash, owed to us, owed by us.",
  "credit-sales": "What left on a promise instead of on payment.",
  "credit-outstanding": "Credit that has not come back yet.",
  "credit-overdue": "Credit past its due date — who to ring first.",
  "credit-collection": "How much of the credit given has been collected.",
  "credit-aging": "How long the unpaid credit has been unpaid.",
  "credit-by-batch": "Which flights went out on credit.",
  "credit-by-month": "The credit book month by month.",
  "credit-customers": "Each customer's limit, what is used, what is left.",
  receivables: "Who owes us, and how old the oldest of it is.",
  outstanding: "Which bills are unpaid, customer by customer.",
  "batch-profit": "What each flight earned against what it cost to move.",
  storage: "What is sitting in the warehouse, how long, and what it is charging.",
  payroll: "Every salary run and where it stopped.",
  /* "On the books" was a wider claim than the query: staffReport() reads
     active accounts only, so anybody deactivated is absent from a document
     titled Staff register. Worded as the report's own caption words it. */
  staff: "Everybody with a live account, what they do and what they are paid.",
  ledger: "Every movement of money in the order it happened.",
  bank: "Every movement through a bank account.",
  "mobile-money": "Every movement through M-Pesa, Mixx and the rest.",
  /* Named for what it reads, not for a model: there is no petty-cash entity in
     this system — this is every CASH-kind account. */
  "petty-cash": "Every movement of physical cash, and what the tin should hold.",
};

/**
 * The shelves, in the words the owner uses when he asks for one.
 *
 * lib/reports.ts stays the register of WHICH reports exist and what each is
 * called; this only says which shelf a key sits on. A key listed here that the
 * register no longer has renders nothing, and a key the register gains that is
 * not listed here still appears, under the last shelf — the register grew by two
 * reports while this page was being written, and a hub that silently hides one
 * is the failure mode to design out.
 */
const SHELVES: { name: string; keys: ReportKey[] }[] = [
  {
    name: "Profit, revenue and expense",
    keys: [
      "profit-loss",
      "income",
      "expenses",
      "expense-by-category",
      "monthly-summary",
      "cash-flow",
      "financial-statement",
    ],
  },
  {
    name: "Collection and credit",
    keys: [
      "credit-sales",
      "credit-collection",
      "credit-outstanding",
      "credit-overdue",
      "credit-aging",
      "credit-by-batch",
      "credit-by-month",
    ],
  },
  { name: "Customers", keys: ["credit-customers", "receivables", "outstanding"] },
  { name: "Cargo and warehouse", keys: ["batch-profit", "storage"] },
  { name: "Staff and payroll", keys: ["payroll", "staff"] },
  { name: "Accounts", keys: ["ledger", "bank", "mobile-money", "petty-cash"] },
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

  const [pl, previous, credit, volume, rateRow] =
    await Promise.all([
      profitAndLoss(picked.window),
      profitAndLoss(picked.previous),
      creditForPeriod(picked.window),
      /* One engine, not three counts of our own — see volumeInWindow. The
         earlier note here argued the page had to keep its own queries because
         it filtered deleted cargo and the engines did not. That was wrong:
         lib/prisma.ts applies that filter to every shipment read, so both sides
         always counted the same rows. */
      volumeInWindow(picked.window.from, picked.window.to),
      currentRate(),
    ]);

  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const money = (n: number) => formatShillings(n, rate);

  /* Against the period before it, because a figure with nothing beside it is
     not a finding. The percentage itself is lib/format's percentDelta — the
     same call the manager's own overview strip makes, so a change quoted off
     this sheet and one quoted off that strip cannot part company. It returns
     undefined where the period before had nothing to measure against, because
     "+∞%" is a sentence the data does not support. */
  const rows: {
    label: string;
    value: string;
    sub?: string;
    /** percentDelta's answer, or undefined where there is no comparison. */
    delta?: number;
    /** Printed in place of the percentage when there is none. An empty column
     *  where a change usually sits is read as "no change". */
    note?: string;
    tone?: "good" | "bad";
  }[] = [
    {
      label: "Billed",
      value: money(pl.revenue),
      sub: `${pl.invoices} ${t(locale, "confirmed bills")}`,
      delta: percentDelta(pl.revenue, previous.revenue),
      note:
        previous.revenue > 0 ? undefined : "nothing billed in the period before",
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
      delta: percentDelta(pl.costs, previous.costs),
      note: previous.costs > 0 ? undefined : "nothing spent in the period before",
    },
    {
      label: "Profit",
      value: money(pl.profit),
      /* profitAndLoss already divides these two and already guards the month
         with no revenue. Dividing them again here would be a second definition
         of margin, and the day one of them changes what revenue means the two
         sheets stop agreeing about the same period. */
      sub:
        pl.margin === null
          ? undefined
          : `${pl.margin.toFixed(0)}% ${t(locale, "margin")}`,
      /* Only against a profit. percentDelta divides by whatever base it is
         handed, and a period that climbed out of a loss would come back as a
         large NEGATIVE change — the one figure on this sheet a manager could
         act on backwards. */
      delta:
        previous.profit > 0
          ? percentDelta(pl.profit, previous.profit)
          : undefined,
      note: previous.profit > 0 ? undefined : "no profit in the period before",
      tone: pl.profit < 0 ? "bad" : "good",
    },
  ];

  /*
    The endpoint Finance already downloads from, deliberately not a manager copy
    of it. The register, the runner, the CSV and the PDF are one path, so a
    figure the manager hands over and a figure Finance hands over cannot differ.

    `period` carries the pills above onto the document — the route resolves it
    through the same windowFor this page used — and `unit=tzs` matches the
    screen, which leads in shillings. The handful of reports that can only be
    read as at today override the period on their own document; listing them
    here would be a second answer to "which reports honour a window".
  */
  const download = (key: ReportKey, format?: "pdf") =>
    `/api/finance/reports?report=${key}&period=${picked.key}&unit=tzs${
      format ? `&format=${format}` : ""
    }`;

  /* Built from the register rather than from SHELVES, so a report that exists
     is always reachable and a shelf entry that no longer exists renders
     nothing — no tile that downloads an error. */
  const shelved = new Set<string>(SHELVES.flatMap((s) => s.keys));
  const shelves = [
    ...SHELVES.map((s) => ({
      name: s.name,
      reports: s.keys.flatMap((key) => REPORTS.filter((r) => r.key === key)),
    })),
    { name: "Other reports", reports: REPORTS.filter((r) => !shelved.has(r.key)) },
  ].filter((s) => s.reports.length > 0);

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
          { icon: Boxes, label: "Cargo registered", value: volume.registered },
          { icon: Plane, label: "Batches flown", value: volume.batchesFlown },
          { icon: Truck, label: "Delivered", value: volume.delivered },
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
            {r.delta !== undefined ? (
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
            ) : r.note ? (
              /* Allowed to shrink, unlike the percentage: this is a sentence,
                 and the money beside it is what the row is for. */
              <span className="shrink text-right text-[11px] text-muted-foreground">
                {t(locale, r.note)}
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

      {/* Hidden on paper. The report above is what gets signed and handed over;
          a page of links printed underneath it is a page of dead ink. */}
      <div className="mt-8 print:hidden">
        <SectionLabel
          action={{
            href: `/app/finance/reports?period=${picked.key}`,
            label: t(locale, "Open the viewer"),
          }}
        >
          {t(locale, "Every report you can run")}
        </SectionLabel>
        <p className="-mt-1 mb-3 text-[11px] text-muted-foreground">
          {t(
            locale,
            "Each one covers the period chosen above, in the same money this page is showing. A few can only be read as at today; each says so on its own document."
          )}
        </p>

        {shelves.map((shelf) => (
          <div key={shelf.name} className="mb-3 overflow-hidden rounded-xl border bg-card">
            <p className="border-b bg-muted/30 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t(locale, shelf.name)}
            </p>
            <div className="divide-y">
              {shelf.reports.map((r) => {
                const ask = ASKS[r.key];
                return (
                  <div
                    key={r.key}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2"
                  >
                    <span className="min-w-0 flex-1">
                      {/* The name opens the report on screen — where it can be
                          filtered, and read before it is handed to anybody. */}
                      <Link
                        href={`/app/finance/reports?report=${r.key}&period=${picked.key}#reports`}
                        className="focus-ring text-sm font-medium hover:underline"
                      >
                        {t(locale, r.label)}
                      </Link>
                      {ask ? (
                        <span className="block text-[11px] text-muted-foreground">
                          {t(locale, ask)}
                        </span>
                      ) : null}
                    </span>
                    <span className="inline-flex shrink-0 overflow-hidden rounded-md border">
                      {/* Its own tab: a document is read beside the hub, not
                          instead of it. */}
                      <a
                        href={download(r.key, "pdf")}
                        target="_blank"
                        rel="noopener"
                        className="focus-ring inline-flex min-h-[36px] items-center gap-1.5 border-r px-2.5 text-[11px] font-medium hover:bg-accent sm:min-h-0 sm:py-1"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        {t(locale, "PDF")}
                      </a>
                      {/* "Excel (CSV)" and not "Excel": what downloads is a CSV,
                          which Excel opens directly. Naming it xlsx would be
                          promising a format nothing in this system writes. */}
                      <a
                        href={download(r.key)}
                        className="focus-ring inline-flex min-h-[36px] items-center gap-1.5 px-2.5 text-[11px] font-medium hover:bg-accent sm:min-h-0 sm:py-1"
                      >
                        <Download className="h-3.5 w-3.5" />
                        {t(locale, "Excel (CSV)")}
                      </a>
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
