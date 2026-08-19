import type { Metadata } from "next";
import Link from "next/link";
import { Search, Undo2 } from "lucide-react";

import { FinanceNav } from "@/components/app/finance-nav";
import { IncomeSheetTable } from "@/components/app/income-sheet";
import { PageHeader } from "@/components/app/page-header";
import { Input } from "@/components/ui/input";
import { financeTabs } from "@/lib/finance-tabs";
import { incomeSheet } from "@/lib/income";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Closed batches" };

/**
 * Every batch whose books are shut, and what each one made.
 *
 * The register Finance has always kept by hand, in the system so the boss can
 * read the same thing without anybody typing it twice. Every figure except two
 * per-kilo rates is computed from the invoices and payments already on record,
 * so it cannot drift from the books.
 *
 * It is not only an archive. A closed batch is the last thing that happens to
 * a batch, so this is also where the two ways back live: the boss can send a
 * statement back for Finance to fix, and an admin can reopen the batch itself.
 * Both belong on the page that lists what is closed, because that is where
 * somebody goes looking for the one that is wrong.
 */
export default async function ClosedBatchesPage({
  searchParams,
}: {
  searchParams: Promise<{
    month?: string;
    status?: string;
    q?: string;
    period?: string;
  }>;
}) {
  const user = await requirePermission("accounting.view");
  const { month, status, q, period } = await searchParams;

  const sheet = await incomeSheet(month, status, q, period);
  const canReopen = can(user.role, "batch.close");
  /* Whole dollars — these are batches, not invoices, same as the table below. */
  const usd = (n: number) =>
    `USD ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  /* Kept in the links so one filter does not silently drop another. */
  const withParams = (next: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = { month, status, q, period, ...next };
    for (const [key, value] of Object.entries(merged)) {
      if (value) params.set(key, value);
    }
    const query = params.toString();
    return query ? `?${query}` : "?";
  };

  const states = [
    { key: "", label: "All", count: sheet.total },
    { key: "RETURNED", label: "Sent back", count: sheet.counts.returned },
    { key: "SUBMITTED", label: "With the boss", count: sheet.counts.submitted },
    { key: "CONFIRMED", label: "Confirmed", count: sheet.counts.confirmed },
  ];

  const pill =
    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors";

  return (
    <>
      <PageHeader
        title="Closed batches"
        description="What each closed batch made. The figures are worked out when Finance shuts the books and frozen there — then the boss reviews them."
      />
      <FinanceNav tabs={financeTabs(user.role)} />

      {/*
        Sent back, and said first.

        A returned statement is the only row on this page that is somebody's
        job today: the boss has read it, disagreed, and written down why. It
        is easy to miss as a coloured chip in a long table, so it gets its own
        block at the top with the reason and a way straight into the batch.
      */}
      {sheet.returned.length > 0 ? (
        <div className="mb-4 overflow-hidden rounded-xl border border-destructive/30 bg-destructive/[0.05]">
          <p className="border-b border-destructive/20 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-destructive">
            <Undo2 className="mr-1.5 inline h-3.5 w-3.5" />
            {sheet.returned.length === 1
              ? "1 batch was sent back to be fixed"
              : `${sheet.returned.length} batches were sent back to be fixed`}
          </p>
          <ul className="divide-y divide-destructive/15">
            {sheet.returned.map((row) => (
              <li
                key={row.batchId}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-2.5 text-sm"
              >
                <Link
                  href={`/app/shipments/${row.batchId}`}
                  className="font-mono text-xs font-semibold hover:underline"
                >
                  {row.batchNumber}
                </Link>
                <span className="min-w-0 flex-1 text-muted-foreground">
                  {row.reviewNote?.trim()
                    ? `“${row.reviewNote.trim()}”`
                    : "No reason was written down."}
                  {row.reviewedBy ? (
                    <span className="ml-1.5 text-xs">— {row.reviewedBy}</span>
                  ) : null}
                </span>
                <Link
                  href={`/app/shipments/${row.batchId}#batch-costs`}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Open it and fix it →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {sheet.awaiting > 0 ? (
        <p className="mb-4 rounded-xl border border-warning/30 bg-warning/[0.06] px-5 py-3 text-sm">
          <span className="font-medium">{sheet.awaiting}</span>{" "}
          {sheet.awaiting === 1
            ? "batch is waiting for the boss to confirm it."
            : "batches are waiting for the boss to confirm them."}
        </p>
      ) : null}

      {/*
        Find one, or narrow to a kind. Three controls on one line, because a
        register of a hundred batches is looked at with a batch number in mind
        far more often than it is browsed.
      */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <form method="get" className="relative">
          {month ? <input type="hidden" name="month" value={month} /> : null}
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Batch number, who closed it, the boss's note…"
            className="h-9 w-72 pl-9 text-sm"
            aria-label="Search closed batches"
          />
        </form>

        {/*
          This week, this month, or everything.

          Finance does not read a closed batch on its own — it reads the week
          against last week. Choosing a stretch here is what makes the summary
          underneath a comparison instead of a total.
        */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: "week", label: "This week" },
            { key: "month", label: "This month" },
            { key: "", label: "All time" },
          ].map((option) => {
            const active = (period ?? "") === option.key;
            return (
              <Link
                key={option.key || "all"}
                href={withParams({ period: option.key || undefined })}
                className={cn(
                  pill,
                  active
                    ? "border-brand/40 bg-brand/15 text-brand"
                    : "border-transparent text-muted-foreground hover:bg-accent"
                )}
              >
                {option.label}
              </Link>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {states.map((state) => {
            const active = (status ?? "") === state.key;
            return (
              <Link
                key={state.key || "all"}
                href={withParams({ status: state.key || undefined })}
                className={cn(
                  pill,
                  active
                    ? "border-foreground/25 bg-accent text-foreground"
                    : "border-transparent text-muted-foreground hover:bg-accent",
                  /* A sent-back count is worth colouring even unselected. */
                  !active && state.key === "RETURNED" && state.count > 0
                    ? "text-destructive"
                    : ""
                )}
              >
                {state.label}
                {state.count > 0 ? (
                  <span className="ml-1.5 tabular-nums opacity-70">
                    {state.count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>

        {sheet.months.length > 1 ? (
          <div className="flex flex-wrap gap-1.5">
            {[{ key: "", label: "Every month" }, ...sheet.months].map((option) => {
              const active = (month ?? "") === option.key;
              return (
                <Link
                  key={option.key || "all"}
                  href={withParams({ month: option.key || undefined })}
                  className={cn(
                    pill,
                    active
                      ? "border-foreground/25 bg-accent text-foreground"
                      : "border-transparent text-muted-foreground hover:bg-accent"
                  )}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        ) : null}

        {/* Only when something is actually filtered, and it says what it will
            undo rather than a bare "clear". */}
        {month || status || q ? (
          <Link
            href="?"
            className="text-xs text-muted-foreground underline hover:text-foreground"
          >
            Show every closed batch
          </Link>
        ) : null}
      </div>

      {/*
        What the chosen stretch made, against the one before it.

        A row of closed batches answers "what happened"; it does not answer
        "was that better or worse than last week", which is the question the
        boss actually asks. Each figure carries its own change, and the change
        is stated in the same words a person would use — up, down, or the same
        — rather than an arrow nobody is sure the direction of.

        Only when a stretch is chosen. Comparing "all time" against the period
        before all time is not a thing.
      */}
      {sheet.period && sheet.rows.length > 0 ? (
        <dl className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-4">
          {(() => {
            const p = sheet.period!;
            const change = (now: number, before: number) => {
              if (before === 0) return now === 0 ? null : `new ${p.previousLabel === "last week" ? "this week" : "this month"}`;
              const pct = Math.round(((now - before) / Math.abs(before)) * 100);
              if (pct === 0) return `same as ${p.previousLabel}`;
              return `${pct > 0 ? "up" : "down"} ${Math.abs(pct)}% on ${p.previousLabel}`;
            };
            /*
              Counted the same way the money is.

              A sent-back statement stays on the page and out of the totals,
              because its batch is open again — so counting it here produced
              "1 batch closed" beside "USD 0 billed" in the same row of cards,
              which reads as a bug in the money rather than a batch the boss
              rejected.
            */
            const counted = sheet.rows.filter((row) => row.status !== "RETURNED");
            const cells = [
              {
                k: "Batches closed",
                v: String(counted.length),
                d: change(counted.length, p.batches),
                up: counted.length >= p.batches,
              },
              {
                k: "Weight closed",
                v: `${sheet.totals.kg.toFixed(1)} kg`,
                d: change(sheet.totals.kg, p.kg),
                up: sheet.totals.kg >= p.kg,
              },
              {
                k: "Billed",
                v: usd(sheet.totals.worthUsd),
                d: change(sheet.totals.worthUsd, p.worthUsd),
                up: sheet.totals.worthUsd >= p.worthUsd,
              },
              {
                k: "Profit",
                v: usd(sheet.totals.profitUsd),
                d: change(sheet.totals.profitUsd, p.profitUsd),
                up: sheet.totals.profitUsd >= p.profitUsd,
              },
            ];
            return cells.map((cell) => (
              <div
                key={cell.k}
                className={cn(
                  "bg-gradient-to-b to-transparent bg-card px-5 py-4",
                  cell.up ? "from-success/10" : "from-destructive/10"
                )}
              >
                <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  {cell.k} · {p.label}
                </dt>
                <dd className="mt-1 whitespace-nowrap font-display text-2xl font-bold leading-tight tabular-nums">
                  {cell.v}
                </dd>
                <p
                  className={cn(
                    "mt-0.5 text-[11px]",
                    cell.d === null
                      ? "text-muted-foreground"
                      : cell.up
                        ? "text-success"
                        : "text-destructive"
                  )}
                >
                  {cell.d ?? `nothing closed ${p.previousLabel}`}
                </p>
              </div>
            ));
          })()}
        </dl>
      ) : null}

      {sheet.rows.length === 0 && sheet.total > 0 ? (
        <p className="mb-4 rounded-xl border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">
          Nothing matches that. {sheet.total} closed{" "}
          {sheet.total === 1 ? "batch" : "batches"} in all —{" "}
          <Link href="?" className="text-brand hover:underline">
            show them
          </Link>
          .
        </p>
      ) : (
        <IncomeSheetTable
          sheet={sheet}
          canReview={can(user.role, "statement.review")}
          canReopen={canReopen}
        />
      )}
    </>
  );
}
