import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, RefreshCw } from "lucide-react";

import { BandHeading, MoneyFlowChart } from "@/components/app/manager-bento";
import { ManagerAttention, type AttnRow } from "@/components/app/manager-attention";
import { ManagerHero } from "@/components/app/manager-hero";
import { ManagerNav } from "@/components/app/manager-nav";
import { t } from "@/lib/i18n";
import { managerHome } from "@/lib/manager-home";
import { FLOW_RANGES } from "@/lib/manager-series";
import { formatShillings } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Command centre" };

/**
 * The manager's command centre.
 *
 * READ TOP TO BOTTOM IT ANSWERS SEVEN QUESTIONS IN ORDER: what is happening,
 * what needs me, how is the business performing, where is the money, how are
 * operations, which departments have a problem, where do I go next. Each band
 * answers exactly one of them and then stops.
 *
 * EVERY FIGURE COMES FROM lib/manager-home.ts AND APPEARS ONCE. The version
 * before this one called nine engines from the markup and composed them inline,
 * which is how the same number came to be printed in five places and how two of
 * those copies came to disagree — one measuring what was billed, the other what
 * was collected, under one word. One engine, one name per figure, and a repeat
 * is now something you can see in a diff.
 *
 * LIVE STATE IS NOT FILTERED BY DATE. The range control belongs to the chart
 * alone and says so. Cargo on the floor, money in the accounts and queues
 * waiting have no date range — narrowing them to "last 7 days" would produce a
 * screen claiming the warehouse is empty.
 */
export default async function ManagerHome({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requirePermission("report.view");
  const locale = await viewerLocale();
  const { range } = await searchParams;

  const [me, home] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { name: true } }),
    managerHome(locale, range),
  ]);

  const firstName = (me?.name ?? user.name).split(" ")[0];
  const now = new Date();
  const money = (usd: number) => formatShillings(usd, home.rate);
  const shillings = (tzs: number) =>
    `TSh ${Math.round(tzs).toLocaleString("en-US")}`;

  const hour = now.getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  /* ------------------------------------------------------ what needs a decision
     Built from the queues that already own each figure, and only where the
     queue is genuinely non-empty. Ordered by how much it should change today. */
  const a = home.attention;
  const rows: AttnRow[] = [];

  const failing = a.checks.checks.filter((c) => !c.ok);
  if (failing.length > 0) {
    rows.push({
      key: "reconcile",
      title: `${failing.length} ${t(locale, failing.length === 1 ? "check does not balance" : "checks do not balance")}`,
      why: failing.map((c) => c.label).join(" · "),
      ageDays: null,
      href: "/app/manager/reconciliation",
      action: t(locale, "Review"),
      severity: "critical",
    });
  }

  for (const q of a.queues) {
    if (q.count === 0) continue;
    rows.push({
      key: `q-${q.key}`,
      title: `${q.count} ${t(locale, q.label)}`,
      why: t(locale, q.detail),
      ageDays: q.oldestDays,
      /* No money figure here. "Where the money is" already states receivables,
         and the unpaid-bills queue's value IS that receivable — the same number
         twice on one screen, which is what this redesign exists to stop. The
         count and the age are what make this row a decision; the amount is a
         balance and belongs in the balance band. */
      href: q.href,
      action: t(locale, "Open"),
      severity: (q.oldestDays ?? 0) >= 3 ? "critical" : "warning",
    });
  }

  if (a.payrollWaiting.length > 0) {
    const oldest = a.payrollWaiting[0];
    rows.push({
      key: "payroll",
      title: `${oldest.code} ${t(locale, "payroll awaiting your approval")}`,
      why: t(locale, "Nobody is paid until this is agreed."),
      ageDays: oldest.waitingDays,
      value: money(oldest.totals.net),
      href: "/app/manager/payroll",
      action: t(locale, "Review"),
      severity: oldest.waitingDays >= 3 ? "critical" : "warning",
    });
  }

  if (a.statements.length > 0) {
    rows.push({
      key: "statements",
      title: `${a.statements.length} ${t(locale, a.statements.length === 1 ? "flight waiting on your signature" : "flights waiting on your signature")}`,
      why: t(locale, "Finance has shut the books and sent the figures up."),
      ageDays: a.statements[0]?.waitingDays ?? null,
      href: "/app/manager/reconciliation",
      action: t(locale, "Review"),
      severity: "warning",
    });
  }

  /* Everything the desks themselves flagged, deduplicated against the queues
     above so a thing already listed is not listed twice. */
  const seen = new Set(rows.map((r) => r.title));
  for (const item of a.items.slice(0, 4)) {
    if (seen.has(item.label)) continue;
    rows.push({
      key: `own-${item.id}`,
      title: item.label,
      why: item.detail,
      ageDays: null,
      /* Same rule as the queue rows above: the desks attach a money figure to
         their own alerts, and on this page that figure is always one the money
         band already states. The row's job is to say a thing needs deciding and
         where to go. */
      href: item.href,
      action: t(locale, "Open"),
      severity: item.severity,
    });
  }

  const ops = home.ops;
  const p = home.position;

  return (
    <>
      {/* 1 ─ header. A greeting, the date, and when this was read. No cards. */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {t(locale, greeting)}, {firstName}.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(locale, "Here is what is happening across Target Express today.")}
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {now.toLocaleDateString(locale === "zh" ? "zh-CN" : "en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </span>
          {/*
            A link to this same page, which is a refresh — the server renders it
            fresh on every request. A button running router.refresh() would be a
            client component and a spinner for the same result.
          */}
          <Link
            href={range ? `/app/manager?range=${range}` : "/app/manager"}
            className="focus-ring inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium transition-colors hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className="h-3 w-3" />
            {t(locale, "Refresh")}
          </Link>
        </div>
      </header>

      {/* 2 ─ every section of the system, one press away */}
      <ManagerNav locale={locale} role={user.role} current="/app/manager" />

      {/* 3 ─ how the business is doing */}
      <ManagerHero
        locale={locale}
        rate={home.rate}
        periodLabel={t(locale, "This month")}
        revenueUsd={home.period.revenueUsd}
        collectedUsd={home.period.collectedUsd}
        expensesUsd={home.period.expensesUsd}
        profitUsd={home.period.profitUsd}
        marginPct={home.period.marginPct}
      />

      {/* 4 ─ what needs this desk */}
      <section className="mb-7">
        <BandHeading
          title={t(locale, "Needs your attention")}
          hint={t(locale, "Only what genuinely waits on a decision from you.")}
          action={{ href: "/app/manager/control", label: t(locale, "Control room") }}
        />
        <ManagerAttention locale={locale} rows={rows} />
      </section>

      {/* 5 ─ how it is trending. One chart, its own range. */}
      <section className="mb-7">
        <BandHeading
          title={t(locale, "Business performance")}
          hint={t(locale, "Money that arrived against money that went out. This range applies to the chart only.")}
        />
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            {FLOW_RANGES.map((r) => (
              <Link
                key={r.key}
                href={`/app/manager?range=${r.key}`}
                className={cn(
                  "focus-ring rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                  home.flow.rangeKey === r.key
                    ? "bg-foreground text-background"
                    : "border text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                {t(locale, r.label)}
              </Link>
            ))}
          </div>

          {home.flow.points.length < 2 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t(locale, "Not enough of a period to draw a shape yet.")}
            </p>
          ) : (
            <>
              <MoneyFlowChart
                labels={home.flow.points.map((x) => x.label)}
                moneyIn={home.flow.points.map((x) => x.moneyIn)}
                moneyOut={home.flow.points.map((x) => x.moneyOut)}
                currentIndex={home.flow.points.length - 1}
                title={t(locale, "Money received against money spent")}
              />
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 border-t pt-3 text-xs">
                <span className="inline-flex items-baseline gap-2">
                  <span className="h-2 w-2 rounded-full bg-success" />
                  <span className="text-muted-foreground">
                    {t(locale, "In")} · {t(locale, home.flow.rangeLabel)}
                  </span>
                  <span className="font-semibold tabular-nums">{money(home.flow.inUsd)}</span>
                </span>
                <span className="inline-flex items-baseline gap-2">
                  <span className="h-2 w-2 rounded-full bg-destructive" />
                  <span className="text-muted-foreground">
                    {t(locale, "Out")} · {t(locale, home.flow.rangeLabel)}
                  </span>
                  <span className="font-semibold tabular-nums">{money(home.flow.outUsd)}</span>
                </span>
                <span className="text-muted-foreground">
                  {t(locale, "by")}{" "}
                  {t(
                    locale,
                    home.flow.bucket === "DAY"
                      ? "day"
                      : home.flow.bucket === "WEEK"
                        ? "week"
                        : "month"
                  )}
                </span>
              </div>
            </>
          )}
        </div>
      </section>

      {/* 6 ─ where the money actually is. A different question from performance. */}
      <section className="mb-7">
        <BandHeading
          title={t(locale, "Where the money is")}
          hint={t(locale, "What the company holds right now, and what it is owed.")}
          action={{ href: "/app/manager/accounts", label: t(locale, "Every account") }}
        />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {[
            { label: "In the bank", value: shillings(p.bankTzs), href: "/app/manager/accounts", warn: p.bankTzs < 0 },
            { label: "Mobile money", value: shillings(p.mobileTzs), href: "/app/manager/accounts" },
            { label: "Cash", value: shillings(p.cashTzs), href: "/app/manager/accounts", warn: p.cashTzs < 0 },
            { label: "Receivables", value: money(p.receivableUsd), href: "/app/collections/follow-up" },
            { label: "On credit", value: money(p.creditUsd), href: "/app/finance/credit" },
          ].map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="focus-ring rounded-xl border bg-card p-3 transition-colors hover:bg-accent/40"
            >
              <p className="text-[11px] text-muted-foreground">{t(locale, c.label)}</p>
              <p
                className={cn(
                  "mt-1 font-display text-[15px] font-bold leading-tight tabular-nums",
                  c.warn && "text-destructive"
                )}
              >
                {c.value}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* 7 ─ operations, live and compact */}
      <section className="mb-7">
        <BandHeading
          title={t(locale, "Operations")}
          hint={t(locale, "Where the cargo is right now. Not affected by the range above.")}
          action={{ href: "/app/manager/operations", label: t(locale, "In full") }}
        />
        <div className="grid grid-cols-3 gap-3 lg:grid-cols-6">
          {[
            { label: "Loading", value: ops.loading, href: "/app/batches" },
            { label: "In the air", value: ops.inAir, href: "/app/shipments" },
            { label: "Landed", value: ops.arrived, href: "/app/shipments" },
            { label: "In warehouse", value: ops.onFloor, href: "/app/shipments" },
            { label: "Ready", value: ops.readyForPickup, href: "/app/shipments" },
            { label: "Overdue", value: ops.delayed, href: "/app/shipments", bad: ops.delayed > 0 },
          ].map((c) => (
            <Link
              key={c.label}
              href={c.href}
              className="focus-ring rounded-xl border bg-card p-3 text-center transition-colors hover:bg-accent/40"
            >
              <p
                className={cn(
                  "font-display text-[22px] font-bold leading-none tabular-nums",
                  c.bad && "text-destructive"
                )}
              >
                {c.value}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t(locale, c.label)}
              </p>
            </Link>
          ))}
        </div>
      </section>

      {/* 8 ─ batches and departments, side by side */}
      <section className="mb-7 grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">{t(locale, "Batch performance")}</h3>
            <Link
              href="/app/manager/batches"
              className="focus-ring inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
            >
              {t(locale, "All batches")}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {home.flights.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t(locale, "No flight has closed its books yet.")}
            </p>
          ) : (
            <ul className="divide-y">
              {home.flights.map((f) => (
                <li key={f.batchNumber} className="flex items-baseline gap-3 py-2">
                  <span className="w-24 shrink-0 font-mono text-xs font-semibold">
                    {f.batchNumber}
                  </span>
                  <span className="flex-1 text-[11px] text-muted-foreground">
                    {t(locale, "revenue")} {money(f.revenue)}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 text-sm font-semibold tabular-nums",
                      f.profit >= 0 ? "text-success" : "text-destructive"
                    )}
                  >
                    {money(f.profit)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold">{t(locale, "Departments")}</h3>
            <Link
              href="/app/manager/operations"
              className="focus-ring inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
            >
              {t(locale, "Every desk")}
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <ul className="divide-y">
            {home.desks.map((d) => (
              <li key={d.key}>
                <Link
                  href={d.href}
                  className="focus-ring -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/40"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      d.problem ? "bg-warning" : "bg-success"
                    )}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">{d.desk}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {d.problem ?? t(locale, "Nothing wrong here")}
                    </span>
                  </span>
                  {/* No headline count. Dar's was the warehouse figure the
                      Operations strip states four rows above, and Finance's was
                      the unpaid count. What a department row adds is the STATE —
                      is anything wrong here — and that is the dot and the line
                      beneath the name. */}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 9 ─ what has happened, briefly */}
      <section>
        <BandHeading
          title={t(locale, "Recent activity")}
          hint={t(locale, "The last few things anybody did that changed a record.")}
          action={{ href: "/app/finance/audit", label: t(locale, "Full log") }}
        />
        {home.activity.length === 0 ? (
          /* §24: a clean positive state rather than an empty box. The log is not
             broken — nothing has happened that a manager would want to read. */
          <p className="rounded-xl border bg-card px-4 py-5 text-center text-sm text-muted-foreground">
            {t(locale, "Nothing has changed a record recently. Sign-ins are not listed here.")}
          </p>
        ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {home.activity.map((entry) => (
            <li key={entry.id} className="flex items-baseline gap-3 px-4 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm">{entry.summary}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">
                {entry.actor?.name ?? entry.actorEmail ?? ""}
              </span>
            </li>
          ))}
        </ul>
        )}
      </section>
    </>
  );
}
