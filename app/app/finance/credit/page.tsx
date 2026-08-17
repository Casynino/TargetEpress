import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";

import { CreditAdjust } from "@/components/app/credit-adjust";
import { CreditDecision } from "@/components/app/credit-decision";
import { EmptyState } from "@/components/app/empty-state";
import { FinanceNav } from "@/components/app/finance-nav";
import { PageHeader } from "@/components/app/page-header";
import { Input } from "@/components/ui/input";
import { CREDIT_STATE_LABEL, dueLabel, type CreditState } from "@/lib/credit";
import { creditOverview, creditRows, pendingCreditRequests } from "@/lib/credit-queries";
import { financeTabs } from "@/lib/finance-tabs";
import { formatDate } from "@/lib/format";
import { currentRate, formatShillings, formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Credit" };

/**
 * The credit book: who took cargo without paying, and how long ago.
 *
 * Ordered by urgency rather than by tidiness. Requests waiting on a decision sit
 * at the top, because cargo is standing in the warehouse until somebody answers
 * them. Then the money, then the list.
 *
 * Dense on purpose. The owner's standing instruction about every list in this
 * app is that the desk is busy and a screen of tall cards is a screen of
 * scrolling — so a credit is one line, the summary is one strip, and the aging
 * analysis is one row of bars rather than a chart with a legend.
 */

const STATE_TONE: Record<CreditState, string> = {
  ACTIVE: "text-foreground",
  PARTIALLY_PAID: "text-brand",
  OVERDUE: "text-destructive",
  PAID: "text-success",
  WAIVED: "text-warning",
};

const FILTERS = [
  { key: "", label: "Everything" },
  { key: "OPEN", label: "Still owing" },
  { key: "OVERDUE", label: "Overdue" },
  { key: "DUE_TODAY", label: "Due today" },
  { key: "DUE_WEEK", label: "Due this week" },
  { key: "PARTIALLY_PAID", label: "Part paid" },
  { key: "PAID", label: "Settled" },
] as const;

export default async function CreditPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; q?: string }>;
}) {
  const user = await requirePermission("credit.view");
  const locale = await viewerLocale();
  const sp = await searchParams;
  const state = (sp.state ?? "") as (typeof FILTERS)[number]["key"];
  const q = sp.q?.trim() ?? "";

  const canDecide = can(user.role, "credit.approve");
  /* Moving a due date is not granting credit. The desk on the phone when a
     customer renegotiates is the desk that should be able to write it down. */
  const canMoveDates = can(user.role, "credit.request");

  const [overview, rows, requests, rateRow] = await Promise.all([
    creditOverview(),
    creditRows({ state: state || undefined, q: q || undefined }),
    canDecide ? pendingCreditRequests() : Promise.resolve([]),
    currentRate(),
  ]);
  const rate = rateRow ? Number(rateRow.rate) : null;

  /* Money leads in shillings, with the dollars underneath — the house rule. */
  const money = (usd: number) => formatShillings(usd, rate);

  const chip =
    "focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors";
  const link = (key: string) => {
    const p = new URLSearchParams();
    if (key) p.set("state", key);
    if (q) p.set("q", q);
    const s = p.toString();
    return s ? `/app/finance/credit?${s}` : "/app/finance/credit";
  };

  const agingMax = Math.max(1, ...overview.aging.map((a) => a.amountUsd));

  /* The two bounds the date picker offers, worked out once on the server so every
     row's calendar agrees and the ceiling matches what adjustCredit enforces. */
  const nowUtc = new Date();
  const todayIso = nowUtc.toISOString().slice(0, 10);
  const ceilingIso = new Date(nowUtc.getTime() + 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <>
      <PageHeader
        title={t(locale, "Credit")}
        description={t(
          locale,
          "Cargo released before payment. None of this is cash — it is money customers still owe, and the oldest debt is the one to ring about."
        )}
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      {/*
        Waiting on a decision, and it goes first.

        A request sitting here means a customer is at the counter and their boxes
        are not moving. Each row carries the exposure the decision would create,
        because "approve USD 500" and "approve USD 500 for somebody already USD
        900 overdue" are different questions and a queue must not flatten them
        into the same one.
      */}
      {requests.length > 0 ? (
        <section className="mb-5 overflow-hidden rounded-xl border border-warning/40 bg-warning/[0.04]">
          <p className="border-b border-warning/30 px-4 py-2 text-xs font-semibold text-warning">
            {requests.length}{" "}
            {t(
              locale,
              requests.length === 1
                ? "credit request waiting on you"
                : "credit requests waiting on you"
            )}
            {" · "}
            <span className="font-normal text-muted-foreground">
              {t(locale, "the cargo does not move until you answer")}
            </span>
          </p>
          <ul className="divide-y divide-warning/20">
            {requests.map((r) => (
              <li key={r.invoiceId} className="px-4 py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="min-w-0 text-sm font-semibold">
                    <span className="truncate">{r.customerName}</span>
                    <span className="ml-2 font-mono text-[11px] font-normal text-muted-foreground">
                      {r.invoiceNumber} · {r.trackingNumber ?? "—"}
                      {r.batchNumber ? ` · ${r.batchNumber}` : ""}
                    </span>
                  </p>
                  <p className="font-display text-sm font-bold tabular">
                    {money(r.outstandingUsd)}
                    <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                      {r.termDays} {t(locale, "days")}
                    </span>
                  </p>
                </div>

                {/* The exposure, in one line: what they owe now, what this would
                    make it, and what their limit allows. */}
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {t(locale, "owes")} {formatUsd(r.check.currentOutstandingUsd)} →{" "}
                  <span
                    className={cn(
                      "font-semibold",
                      r.check.exceedsLimit
                        ? "text-destructive"
                        : r.check.nearLimit
                          ? "text-warning"
                          : "text-foreground"
                    )}
                  >
                    {formatUsd(r.check.totalAfterUsd)}
                  </span>{" "}
                  {r.check.limitUsd === null
                    ? `· ${t(locale, "no limit set")}`
                    : `${t(locale, "of")} ${formatUsd(r.check.limitUsd)} ${t(locale, "limit")}`}
                  {r.check.exceedsLimit ? (
                    <span className="font-semibold text-destructive">
                      {" "}
                      · {t(locale, "OVER THE LIMIT")}
                    </span>
                  ) : null}
                  {r.check.hasOverdue ? (
                    <span className="font-semibold text-destructive">
                      {" "}
                      · {t(locale, "already overdue on")} {formatUsd(r.check.overdueUsd)}
                    </span>
                  ) : null}
                  {r.requestedBy ? ` · ${t(locale, "asked by")} ${r.requestedBy}` : ""}
                  {r.requestNote ? ` · “${r.requestNote}”` : ""}
                </p>

                <div className="mt-1.5">
                  <CreditDecision
                    invoiceId={r.invoiceId}
                    invoiceNumber={r.invoiceNumber}
                    termDays={r.termDays}
                    amountUsd={r.outstandingUsd}
                    warning={
                      r.check.exceedsLimit
                        ? "over"
                        : r.check.noFacility
                          ? "none"
                          : r.check.nearLimit
                            ? "near"
                            : null
                    }
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/*
        Six figures, one strip.

        Sold and collected are separated everywhere in this app and especially
        here: a credit sale is revenue that happened and cash that did not, and a
        page that adds them together would be lying about what is in the bank.
      */}
      <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {[
          { k: "Sold on credit", v: overview.soldUsd, tone: "" },
          { k: "Collected", v: overview.collectedUsd, tone: "text-success" },
          { k: "Still owed", v: overview.outstandingUsd, tone: "text-brand" },
          { k: "Overdue", v: overview.overdueUsd, tone: "text-destructive" },
          { k: "Due today", v: overview.dueTodayUsd, tone: "text-warning" },
          { k: "Due this week", v: overview.dueThisWeekUsd, tone: "text-warning" },
        ].map((cell) => (
          <div key={cell.k} className="bg-card px-3 py-2.5">
            <dt className="text-[11px] text-muted-foreground">{t(locale, cell.k)}</dt>
            <dd
              className={cn(
                "font-display text-sm font-bold tabular leading-tight",
                cell.tone
              )}
            >
              {money(cell.v)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          {overview.activeAccountCount} {t(locale, "customers owing")}
          {" · "}
          {overview.facilityCount} {t(locale, "with a credit limit")}
        </span>
        {overview.collectionRate !== null ? (
          <span>
            {overview.collectionRate.toFixed(0)}% {t(locale, "of credit collected")}
          </span>
        ) : null}
        {overview.storageInCreditUsd > 0 ? (
          <span>
            {money(overview.storageInCreditUsd)} {t(locale, "of it is storage")}
          </span>
        ) : null}
        {overview.waivedUsd > 0 ? (
          <span className="text-warning">
            {money(overview.waivedUsd)} {t(locale, "written off")}
          </span>
        ) : null}
      </p>

      {/*
        Aging, as bars rather than a chart.

        Debt does not age gracefully — sixty days late is a different problem
        from four days late, and one "outstanding" total hides which one you
        have. Current is on the row so the problem buckets can be read against
        something.
      */}
      {overview.outstandingUsd > 0 ? (
        <div className="mb-5 grid grid-cols-3 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-6">
          {overview.aging.map((b) => (
            <div key={b.key} className="bg-card px-3 py-2">
              <p className="text-[11px] text-muted-foreground">{t(locale, b.label)}</p>
              <p
                className={cn(
                  "font-display text-xs font-bold tabular",
                  b.key === "current"
                    ? "text-muted-foreground"
                    : b.key === "d60_plus" || b.key === "d31_60"
                      ? "text-destructive"
                      : "text-warning"
                )}
              >
                {money(b.amountUsd)}
              </p>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    b.key === "current"
                      ? "bg-muted-foreground/40"
                      : b.key === "d60_plus" || b.key === "d31_60"
                        ? "bg-destructive"
                        : "bg-warning"
                  )}
                  style={{ width: `${(b.amountUsd / agingMax) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}

      <form
        method="GET"
        className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3"
      >
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q}
            placeholder={t(locale, "Customer, invoice, tracking or phone…")}
            className="h-9 pl-8 text-sm"
          />
        </div>
        {state ? <input type="hidden" name="state" value={state} /> : null}
        <button
          type="submit"
          className="focus-ring h-9 rounded-md border px-3 text-sm font-medium hover:bg-accent"
        >
          {t(locale, "Search")}
        </button>
        {q ? (
          <Link
            href={link(state)}
            className="text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            {t(locale, "Clear")}
          </Link>
        ) : null}
      </form>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={link(f.key)}
            aria-current={state === f.key ? "page" : undefined}
            className={cn(
              chip,
              state === f.key
                ? "border-brand bg-brand text-white"
                : "hover:bg-accent"
            )}
          >
            {t(locale, f.label)}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={t(locale, "No credit here")}
          description={t(
            locale,
            q || state
              ? "Nothing matches that filter."
              : "Nothing has been released on credit yet. Support asks, Finance approves, and it appears here."
          )}
        />
      ) : (
        <>
          <p className="mb-2 text-xs text-muted-foreground">
            {rows.length}{" "}
            {t(locale, rows.length === 1 ? "credit" : "credits")}
            {" · "}
            {money(rows.reduce((n, r) => n + r.outstandingUsd, 0))}{" "}
            {t(locale, "still owing")}
          </p>

          {/* One line each, oldest due first — a call list, in order. */}
          <ul className="panel divide-y overflow-hidden">
            {rows.map((r) => (
              <li
                key={r.invoiceId}
                className="px-4 py-2.5 transition-colors hover:bg-accent/30"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <p className="flex min-w-0 items-baseline gap-2 text-sm font-semibold">
                    <Link
                      href={`/app/customers/${r.customerId}`}
                      className="truncate hover:text-brand hover:underline"
                    >
                      {r.customerName}
                    </Link>
                    <span
                      className={cn(
                        "shrink-0 text-[11px] font-medium",
                        STATE_TONE[r.state]
                      )}
                    >
                      {t(locale, CREDIT_STATE_LABEL[r.state])}
                    </span>
                  </p>
                  <p className="shrink-0 text-right">
                    <span
                      className={cn(
                        "font-display text-sm font-bold tabular",
                        r.outstandingUsd > 0 ? STATE_TONE[r.state] : "text-success"
                      )}
                    >
                      {money(r.outstandingUsd)}
                    </span>
                    {r.paidUsd > 0.005 && r.outstandingUsd > 0.005 ? (
                      <span className="ml-1.5 text-[11px] text-muted-foreground">
                        {t(locale, "of")} {formatUsd(r.totalUsd)}
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
                  <p className="min-w-0 truncate font-mono">
                    {r.invoiceNumber}
                    {r.trackingNumber ? ` · ${r.trackingNumber}` : ""}
                    {r.batchNumber ? ` · ${r.batchNumber}` : ""}
                    {r.storageUsd > 0
                      ? ` · ${t(locale, "storage")} ${formatUsd(r.storageUsd)}`
                      : ""}
                  </p>
                  <span className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        r.state === "OVERDUE" ? "font-semibold text-destructive" : ""
                      )}
                    >
                      {t(locale, dueLabel(r))}
                    </span>
                    {/*
                      The date, and for Finance the date IS the edit control —
                      one thing on the row instead of a figure plus an icon
                      beside it that nobody found. Support reads it plainly:
                      moving a deadline is more credit, and that desk may ask for
                      credit without being able to quietly buy a fortnight.
                    */}
                    {canMoveDates && r.outstandingUsd > 0.005 ? (
                      <CreditAdjust
                        invoiceId={r.invoiceId}
                        dueOn={r.dueDate ? formatDate(r.dueDate, locale) : null}
                        overdue={r.daysOverdue > 0}
                        today={todayIso}
                        ceiling={ceilingIso}
                      />
                    ) : r.dueDate ? (
                      <span className="tabular">{formatDate(r.dueDate, locale)}</span>
                    ) : null}
                    {r.outstandingUsd > 0.005 ? (
                      <>
                        <Link
                          href={`/app/collections/record/${r.invoiceId}`}
                          className="focus-ring rounded px-1.5 py-0.5 font-medium text-success/80 transition-colors hover:bg-success/10 hover:text-success"
                        >
                          {t(locale, "Collect")}
                        </Link>
                      </>
                    ) : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
