import type { Metadata } from "next";
import Link from "next/link";
import { Paperclip } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { FinanceNav } from "@/components/app/finance-nav";
import { RecordCostButton } from "@/components/app/record-cost-button";
import { ExpenseRowActions } from "@/components/app/expense-row-actions";
import { SearchBox } from "@/components/app/search-box";
import { Badge } from "@/components/ui/badge";
import { activeAccounts } from "@/lib/accounts";
import {
  COMMON_EXPENSES,
  EXPENSE_CATEGORY_LABELS as CATEGORY_LABELS,
  EXPENSE_STATUS_LABELS as STATUS_LABEL,
} from "@/lib/expenses";
import { financeTabs } from "@/lib/finance-tabs";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { currentRate, formatShillings, formatUsd } from "@/lib/fx";
import { sumShillings, sumUsd } from "@/lib/money-totals";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Expenses" };

const STATUS_TONE: Record<string, string> = {
  PENDING: "border-warning/40 text-warning",
  APPROVED: "border-brand/40 text-brand",
  PAID: "border-success/40 text-success",
  VOID: "text-muted-foreground line-through",
};

/**
 * Money going out.
 *
 * Rebuilt for a desk that is busy. On a quiet week this page was a total and a
 * list; on a real one it is two hundred costs, and the questions asked of it
 * are "how much have we spent", "what is still owed", "where is the money
 * going" and "where is that one payment I made on Tuesday". None of those had
 * an answer here: there was no search, no way to narrow to a category or an
 * account, no breakdown, and the list stopped silently at a hundred rows.
 *
 * Two dates are tracked and they are genuinely different: when the cost was
 * INCURRED, which is what a profit figure for a month uses, and when the money
 * LEFT, which is what the ledger and a bank statement agree on. The period
 * filter follows INCURRED, because that is what the list below is ordered by —
 * the old page totalled one and listed the other, so the figure at the top and
 * the rows underneath were answering different questions.
 */

/** The three kinds of spending, and what each one is for. */
const KINDS = [
  { key: "all", label: "Everything", hint: "Every cost, whatever it belongs to" },
  {
    key: "flight",
    label: "Batch costs",
    hint: "Attached to a batch — what per-batch profit is made of",
  },
  { key: "office", label: "Office", hint: "Running the business; belongs to no batch" },
  {
    key: "special",
    label: "Special",
    hint: "Recorded and paid, but kept out of operating and batch profit",
  },
  {
    /*
      The boss's own spending, visible without being carved out.

      It counts in every total, every profit figure and every report exactly
      like fuel or rent — nothing about the arithmetic changes. The only thing
      this chip buys is that it can be SEEN and totalled on its own, which is
      the whole of what was asked for: separation for the eye, not for the
      maths.
    */
    key: "executive",
    label: "Executive",
    hint: "Drawn for executive use — counted like any other cost, just easy to find",
  },
] as const;

const PERIODS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "all", label: "All time" },
] as const;

const STATUSES = [
  { key: "", label: "Any status" },
  { key: "PENDING", label: "Not yet paid" },
  { key: "PAID", label: "Paid" },
  { key: "VOID", label: "Cancelled" },
] as const;

/** Enough rows to work through, few enough to render fast. */
const PAGE_SIZE = 40;

/** Start of the chosen window. Null means all time. */
function windowStart(period: string): Date | null {
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === "week") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Monday, because a Tanzanian working week is not read Sunday-first.
    const day = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - day);
    return d;
  }
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  if (period === "all") return null;
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    kind?: string;
    q?: string;
    category?: string;
    status?: string;
    account?: string;
    page?: string;
  }>;
}) {
  const user = await requirePermission("expense.view");
  const locale = await viewerLocale();
  const canRecord = can(user.role, "expense.record");
  const canAdjustLedger = can(user.role, "ledger.adjust");
  const canApprove = can(user.role, "expense.approve");

  const params = await searchParams;
  const period = PERIODS.some((p) => p.key === params.period)
    ? (params.period as string)
    : "month";
  const periodLabel = PERIODS.find((p) => p.key === period)?.label ?? "This month";
  const from = windowStart(period);
  const inWindow = from ? { gte: from } : undefined;

  const kind = KINDS.some((k) => k.key === params.kind)
    ? (params.kind as string)
    : "all";
  const search = (params.q ?? "").trim();
  const category =
    params.category && params.category in CATEGORY_LABELS ? params.category : "";
  const status = STATUSES.some((s) => s.key === params.status && s.key)
    ? (params.status as string)
    : "";
  const accountId = params.account ?? "";
  const page = Math.max(1, Number(params.page) || 1);

  /*
    Three kinds of spending, and they answer different questions.

    A batch cost belongs to a dispatch and is what per-batch profit is made of.
    An office cost keeps the business running and belongs to no batch. A special
    cost is money that left the company but would mislead if counted in either.
  */
  const kindWhere =
    kind === "flight"
      ? { batchId: { not: null }, expenseClass: "OPERATING" as const }
      : kind === "office"
        ? { batchId: null, expenseClass: "OPERATING" as const }
        : kind === "special"
          ? { expenseClass: "NON_OPERATING" as const }
          : kind === "executive"
            ? { category: "EXECUTIVE_DRAW" as const }
            : {};

  /*
    Finding one cost among hundreds.

    A clerk looking for a payment remembers one of five things about it: what it
    was, its number, who was paid, the note they wrote, or the batch it was for.
    So all five are searched at once rather than making them guess which field
    the box means.
  */
  const searchWhere = search
    ? {
        OR: [
          { description: { contains: search, mode: "insensitive" as const } },
          { expenseNumber: { contains: search, mode: "insensitive" as const } },
          { vendor: { contains: search, mode: "insensitive" as const } },
          { note: { contains: search, mode: "insensitive" as const } },
          {
            batch: {
              batchNumber: { contains: search, mode: "insensitive" as const },
            },
          },
        ],
      }
    : {};

  const listWhere = {
    ...(inWindow ? { incurredAt: inWindow } : {}),
    ...kindWhere,
    ...searchWhere,
    ...(category ? { category: category as never } : {}),
    ...(status ? { status: status as never } : {}),
    ...(accountId ? { accountId } : {}),
  };

  /* The money figures ignore cancelled costs — a voided expense is a mistake
     that was withdrawn, not spending. */
  const moneyWhere = {
    ...(inWindow ? { incurredAt: inWindow } : {}),
    ...kindWhere,
    status: { not: "VOID" as const },
  };

  const [
    expenses,
    listCount,
    accounts,
    dispatches,
    recorded,
    paidInWindow,
    unpaid,
    byCategory,
    kindTotals,
    rateRow,
    usedMost,
  ] = await Promise.all([
    prisma.expense.findMany({
      where: listWhere,
      orderBy: [{ incurredAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        account: { select: { name: true } },
        recordedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        batch: { select: { batchNumber: true, id: true } },
        receipts: { select: { id: true, url: true, filename: true } },
      },
    }),
    prisma.expense.count({ where: listWhere }),
    activeAccounts(),
    // Only dispatches still worth attaching a cost to. A batch that closed last
    // year is not what somebody is filing today's customs bill against.
    prisma.batch.findMany({
      where: {
        status: {
          in: ["OPEN", "READY_TO_DEPART", "IN_TRANSIT", "ARRIVED", "VERIFIED"],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, batchNumber: true },
    }),
    /* What the period COST — dated when it was incurred, which is the same
       basis the profit page uses and the same one this list is ordered by. */
    prisma.expense.groupBy({
      by: ["currency"],
      where: moneyWhere,
      _sum: { amount: true, amountUsd: true },
      _count: true,
    }),
    /* What actually LEFT an account inside the period. Different question,
       different date, and both belong on a page about spending. */
    prisma.expense.groupBy({
      by: ["currency"],
      where: { status: "PAID", ...(inWindow ? { paidAt: inWindow } : {}) },
      _sum: { amount: true, amountUsd: true },
      _count: true,
    }),
    /* Still owed, whenever it was incurred — a bill from March that nobody has
       paid is this week's problem, not March's. */
    prisma.expense.groupBy({
      by: ["currency"],
      where: { status: { in: ["PENDING", "APPROVED"] } },
      _sum: { amount: true, amountUsd: true },
      _count: true,
    }),
    prisma.expense.groupBy({
      by: ["category"],
      where: moneyWhere,
      _sum: { amountUsd: true },
      _count: true,
      orderBy: { _sum: { amountUsd: "desc" } },
      take: 8,
    }),
    /* One total per kind, so the chips carry their own weight instead of being
       four words a reader has to click to price. */
    Promise.all(
      KINDS.map(async (k) => {
        const where =
          k.key === "flight"
            ? { batchId: { not: null }, expenseClass: "OPERATING" as const }
            : k.key === "office"
              ? { batchId: null, expenseClass: "OPERATING" as const }
              : k.key === "special"
                ? { expenseClass: "NON_OPERATING" as const }
                : k.key === "executive"
                  ? { category: "EXECUTIVE_DRAW" as const }
                  : {};
        const rows = await prisma.expense.groupBy({
          by: ["currency"],
          where: {
            ...(inWindow ? { incurredAt: inWindow } : {}),
            status: { not: "VOID" as const },
            ...where,
          },
          _sum: { amount: true, amountUsd: true },
          _count: true,
        });
        const money = rows.map((row) => ({
          currency: row.currency,
          amount: row._sum.amount,
          amountUsd: row._sum.amountUsd,
        }));
        return {
          key: k.key,
          usd: sumUsd(money, null),
          /* Exact for shilling costs; the chip is read in shillings. */
          rows: money,
          count: rows.reduce((n, row) => n + (row._count as unknown as number), 0),
        };
      })
    ),
    currentRate(),
    /*
      The shortcuts become the business's own: what has actually been recorded
      most often leads, and the seeded common costs fill in behind.

      Bounded to the last six months. This grouped every non-void expense ever
      recorded, on every single load of the page — a scan that costs nothing in
      the first year and grows without limit after it, to answer a question
      ("what do we type most often?") that only cares about recent habit
      anyway. A cost nobody has recorded since last year is not a shortcut.
    */
    prisma.expense.groupBy({
      by: ["description", "category"],
      where: {
        status: { not: "VOID" },
        incurredAt: {
          gte: new Date(Date.now() - 183 * 24 * 60 * 60 * 1000),
        },
      },
      _count: true,
      orderBy: { _count: { description: "desc" } },
      take: 8,
    }),
  ]);

  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const money = (usd: number) => formatShillings(usd, rate);

  /*
    Costs are added up in the currency they were paid in.

    TSh 20,000 and TSh 40,000 read as TSh 59,994 on this page, because each was
    stored as a rounded dollar snapshot — 7.41 and 14.81 — and 22.22 back
    through 2,700 is not 60,000. The ledger, the Overview and this page each
    produced a different sixty thousand. See lib/money-totals.ts.
  */
  const asMoney = (
    rows: { currency: string; _sum: { amount: unknown; amountUsd: unknown } }[]
  ) =>
    rows.map((row) => ({
      currency: row.currency,
      amount: row._sum.amount as never,
      amountUsd: row._sum.amountUsd as never,
    }));
  const countOf = (rows: { _count: unknown }[]) =>
    rows.reduce((n, row) => n + (row._count as number), 0);

  const recordedRows = asMoney(recorded);
  const paidRows = asMoney(paidInWindow);
  const unpaidRows = asMoney(unpaid);

  const recordedUsd = sumUsd(recordedRows, rate);
  const paidUsd = sumUsd(paidRows, rate);
  const unpaidUsd = sumUsd(unpaidRows, rate);
  const recordedTsh = sumShillings(recordedRows, rate);
  const paidTsh = sumShillings(paidRows, rate);
  const unpaidTsh = sumShillings(unpaidRows, rate);
  /* Figures already in shillings — never multiplied a second time. */
  const shillings = (value: number, usdFallback: number) =>
    rate ? `TSh ${Math.round(value).toLocaleString("en-US")}` : formatUsd(usdFallback);
  const biggest = byCategory[0];

  const seen = new Set<string>();
  const quick = [
    ...usedMost.map((row) => ({
      label: row.description,
      category: row.category as string,
    })),
    ...COMMON_EXPENSES,
  ]
    .filter((item) => {
      const key = item.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 12);

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    accountNumber: a.accountNumber,
  }));

  /** Every control keeps the others, so narrowing never silently resets. */
  const link = (next: Record<string, string | undefined>) => {
    const merged: Record<string, string | undefined> = {
      period: period === "month" ? undefined : period,
      kind: kind === "all" ? undefined : kind,
      q: search || undefined,
      category: category || undefined,
      status: status || undefined,
      account: accountId || undefined,
      /* Any change of filter starts again at page one — page 4 of a different
         list is a blank screen that looks like a bug. */
      page: undefined,
      ...next,
    };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) qs.set(k, v);
    const s = qs.toString();
    return `/app/finance/expenses${s ? `?${s}` : ""}`;
  };

  const filtered = Boolean(search || category || status || accountId);
  const pages = Math.max(1, Math.ceil(listCount / PAGE_SIZE));
  const firstOnPage = listCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastOnPage = Math.min(page * PAGE_SIZE, listCount);

  const chip =
    "focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors";

  return (
    <>
      <PageHeader
        title={t(locale, "Expenses")}
        description={t(
          locale,
          "What the business spends, and what it has already paid. Costs are dated when they were incurred; the money is dated when it left."
        )}
        actions={
          canRecord ? (
            /* A dialog, not a form unfolding inside the page header.

               The header's actions slot has no width of its own, so opening the
               form there let it grow to whatever it liked: it ran off the right
               edge of the screen, took the "Paid from" field and the receipt row
               with it, and sat on top of the page title. The ledger has opened
               this as a centred dialog for months; the Expenses page now does
               the same thing, which is also the smaller change. */
            <RecordCostButton
              categories={Object.entries(CATEGORY_LABELS).map(([value, label]) => ({
                value,
                label: t(locale, label),
              }))}
              accounts={accountOptions}
              dispatches={dispatches.map((d) => ({ id: d.id, label: d.batchNumber }))}
              quick={quick}
              rate={rate}
            />
          ) : null
        }
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      {/*
        Which kind of spending, and what each kind actually came to.

        The chips used to be four words. Carrying their own totals turns the
        filter row into the first answer on the page: a glance says whether the
        month went on moving cargo or on running the office.
      */}
      {/*
        The five kinds of spending, as a set rather than five grey boxes.

        Each carries its own total, its share of the month as a bar, and its
        own colour — so the row answers "where did the money go" before any
        chart does. Gold is the boss's, the same gold that marks his rows in
        the ledger, so the two screens agree without a caption.
      */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {KINDS.map((k) => {
          const total = kindTotals.find((row) => row.key === k.key);
          const active = kind === k.key;
          const usd = total?.usd ?? 0;
          /* The chip is read in shillings, so it is summed in shillings. */
          const tshTotal = sumShillings(total?.rows ?? [], rate);
          const share =
            k.key === "all" || recordedUsd <= 0
              ? 100
              : Math.round((usd / recordedUsd) * 100);
          const tone =
            k.key === "executive"
              ? { text: "text-warning", bar: "bg-warning", wash: "from-warning/[0.14]", ring: "ring-warning/40 border-warning/40" }
              : k.key === "flight"
                ? { text: "text-brand", bar: "bg-brand", wash: "from-brand/[0.12]", ring: "ring-brand/40 border-brand/40" }
                : k.key === "office"
                  ? { text: "text-signal", bar: "bg-signal", wash: "from-signal/[0.10]", ring: "ring-signal/40 border-signal/40" }
                  : k.key === "special"
                    ? { text: "text-muted-foreground", bar: "bg-muted-foreground/60", wash: "from-muted-foreground/[0.10]", ring: "ring-foreground/25 border-foreground/25" }
                    : { text: "text-foreground", bar: "bg-foreground/70", wash: "from-foreground/[0.08]", ring: "ring-foreground/30 border-foreground/30" };
          return (
            <Link
              key={k.key}
              href={link({ kind: k.key === "all" ? undefined : k.key })}
              aria-current={active ? "true" : undefined}
              title={t(locale, k.hint)}
              className={cn(
                "focus-ring group relative overflow-hidden rounded-xl border bg-card px-3.5 py-3 transition-all",
                "bg-gradient-to-br to-transparent hover:-translate-y-px hover:shadow-lift",
                tone.wash,
                active ? cn("ring-1", tone.ring) : "hover:border-foreground/20"
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t(locale, k.label)}
                </p>
                <span className="rounded-full bg-background/70 px-1.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {total?.count ?? 0}
                </span>
              </div>
              <p
                className={cn(
                  "mt-1.5 whitespace-nowrap font-display text-[17px] font-bold leading-none tabular-nums",
                  active ? tone.text : "text-foreground"
                )}
              >
                {shillings(tshTotal, usd)}
              </p>
              {/* Its share of everything spent, so the row reads as a
                  breakdown and not five unrelated figures. */}
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-all", tone.bar)}
                  style={{ width: `${Math.max(2, Math.min(100, share))}%` }}
                />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Period. "How much did we spend" is meaningless without saying over
          what, and it is URL state so a month can be linked to. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={link({ period: p.key === "month" ? undefined : p.key })}
            aria-current={period === p.key ? "true" : undefined}
            className={cn(
              chip,
              period === p.key
                ? "border-brand bg-brand text-brand-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {t(locale, p.label)}
          </Link>
        ))}
        {rate ? (
          <span className="ml-auto text-[11px] text-muted-foreground">
            USD 1 = TSh {rate.toLocaleString("en-US")}
          </span>
        ) : null}
      </div>

      {/*
        The one thing the cards above cannot say.

        This line used to open "17 costs recorded this month · TSh 39,409,011"
        — both of which the Everything card already carries, in bigger type,
        four inches higher. What is left is the only fact that is not up
        there: whether any of it is still owed.
      */}
      {unpaidUsd > 0 ? (
        <p className="mb-3">
          <Link
            href={link({ status: "PENDING", period: "all" })}
            className="text-sm font-medium text-destructive hover:underline"
          >
            {shillings(unpaidTsh, unpaidUsd)} {t(locale, "still to pay")} (
            {countOf(unpaid)})
          </Link>
        </p>
      ) : (
        <p className="mb-3 text-xs text-success">
          {t(locale, "Everything recorded has been paid.")}
        </p>
      )}

      {/*
        Find one, or narrow to a kind.

        Still one GET form, so the result is a linkable URL and the selects
        submit with the box — but the box now shows what it can find while you
        type. Hunting "that payment on Tuesday" through two hundred costs by
        guessing at the spelling of a vendor is a guess you only price after the
        page reloads; the suggestions are the costs already listed below, so
        picking one can never disagree with them.

        They are the rows on THIS page, forty at a time. That is a shortcut and
        it is honest about being one — a second "what matches" definition living
        in SQL alongside the query underneath is how two screens start telling
        two stories.

        Everything the page already knows is carried in hidden fields, so
        searching inside "Batch costs, this year" throws away neither. The page
        number is deliberately NOT carried: a new search is a new list, and page
        4 of it is a blank screen that looks like a bug.
      */}
      <div className="mb-3 rounded-xl border bg-card p-3">
        <SearchBox
          defaultValue={search}
          placeholder={t(
            locale,
            "What it was, the number, who was paid, a note, a batch…"
          )}
          suggestions={expenses.flatMap((expense) => [
            {
              value: expense.description,
              label: expense.description,
              hint: formatMoney(expense.amount, expense.currency),
            },
            {
              value: expense.expenseNumber,
              label: expense.description,
              hint: expense.expenseNumber,
            },
            ...(expense.vendor
              ? [
                  {
                    value: expense.vendor,
                    label: expense.vendor,
                    hint: t(locale, "vendor"),
                  },
                ]
              : []),
            ...(expense.batch
              ? [
                  {
                    value: expense.batch.batchNumber,
                    label: expense.batch.batchNumber,
                    hint: t(locale, "batch"),
                  },
                ]
              : []),
          ])}
        >
          {period !== "month" ? (
            <input type="hidden" name="period" value={period} />
          ) : null}
          {kind !== "all" ? <input type="hidden" name="kind" value={kind} /> : null}

          {/* The other three narrowings, on their own line under the box. They
              submit with it, so none of them is silently dropped by a search. */}
          <div className="order-1 flex w-full flex-wrap items-center gap-2">
            <select
              name="category"
              defaultValue={category}
              aria-label={t(locale, "Category")}
              className="focus-ring h-9 rounded-md border bg-card px-2 text-sm"
            >
              <option value="">{t(locale, "Every category")}</option>
              {Object.entries(CATEGORY_LABELS).map(([value, labelText]) => (
                <option key={value} value={value}>
                  {t(locale, labelText)}
                </option>
              ))}
            </select>

            <select
              name="status"
              defaultValue={status}
              aria-label={t(locale, "Status")}
              className="focus-ring h-9 rounded-md border bg-card px-2 text-sm"
            >
              {STATUSES.map((s) => (
                <option key={s.key} value={s.key}>
                  {t(locale, s.label)}
                </option>
              ))}
            </select>

            <select
              name="account"
              defaultValue={accountId}
              aria-label={t(locale, "Paid from")}
              className="focus-ring h-9 rounded-md border bg-card px-2 text-sm"
            >
              <option value="">{t(locale, "Any account")}</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>

            {filtered ? (
              <Link
                href={link({
                  q: undefined,
                  category: undefined,
                  status: undefined,
                  account: undefined,
                })}
                className="text-xs text-muted-foreground underline hover:text-foreground"
              >
                {t(locale, "Clear the filters")}
              </Link>
            ) : null}
          </div>
        </SearchBox>
      </div>

      {/* What the reader is looking at — never a list that silently stops. */}
      <p className="mb-2 text-xs text-muted-foreground">
        {listCount === 0
          ? t(locale, "Nothing matches.")
          : `${t(locale, "Showing")} ${firstOnPage}–${lastOnPage} ${t(locale, "of")} ${listCount} ${t(locale, listCount === 1 ? "cost" : "costs")}`}
        {filtered ? ` · ${t(locale, "filtered")}` : ""}
      </p>

      {expenses.length === 0 ? (
        <EmptyState
          title={
            filtered
              ? t(locale, "Nothing matches those filters")
              : period === "all"
                ? t(locale, "No costs recorded yet")
                : `${t(locale, "Nothing recorded")} ${t(locale, periodLabel).toLowerCase()}`
          }
          description={
            filtered
              ? t(locale, "Try a wider period, or clear the filters above.")
              : period === "all"
                ? t(
                    locale,
                    "Every cost recorded here becomes part of the profit figure — and one tied to a dispatch becomes part of that batch's."
                  )
                : t(locale, "Try a wider period, or record the first one.")
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
          <ul className="divide-y">
            {expenses.map((expense) => {
              const usd = toNumber(expense.amountUsd);
              return (
                <li key={expense.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {expense.description}
                        {/* Marked wherever it appears, not only when filtered
                            for — a reader scanning the list has to see which
                            figures sit outside the profit calculation. */}
                        {expense.expenseClass === "NON_OPERATING" ? (
                          <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">
                            {t(locale, "Special — not in profit")}
                          </span>
                        ) : null}
                        {/* Marked wherever it appears. It is an ordinary cost
                            in every calculation; this is so a reader can tell
                            which part of the month's spending it was. */}
                        {expense.category === "EXECUTIVE_DRAW" ? (
                          <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-semibold text-warning">
                            {t(locale, "Executive")}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                        <span className="font-mono">{expense.expenseNumber}</span>
                        <span>·</span>
                        <span>{t(locale, CATEGORY_LABELS[expense.category])}</span>
                        {expense.vendor ? (
                          <>
                            <span>·</span>
                            <span>{expense.vendor}</span>
                          </>
                        ) : null}
                        <span>·</span>
                        <span>{formatDate(expense.incurredAt, locale)}</span>
                        {expense.batch ? (
                          <>
                            <span>·</span>
                            <Link
                              href={`/app/batches/${expense.batch.id}`}
                              className="hover:text-brand"
                            >
                              {expense.batch.batchNumber}
                            </Link>
                          </>
                        ) : null}
                        {expense.status === "PAID" && expense.account ? (
                          <>
                            <span>·</span>
                            <span>
                              {t(locale, "paid from")} {expense.account.name}
                              {expense.paidAt
                                ? ` ${formatDate(expense.paidAt, locale)}`
                                : ""}
                            </span>
                          </>
                        ) : null}
                        {expense.receipts.length > 0 ? (
                          <>
                            <span>·</span>
                            <a
                              href={expense.receipts[0].url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 hover:text-brand"
                            >
                              <Paperclip className="h-3 w-3" />
                              {expense.receipts.length === 1
                                ? t(locale, "receipt")
                                : `${expense.receipts.length} ${t(locale, "receipts")}`}
                            </a>
                          </>
                        ) : null}
                      </p>
                    </div>

                    {/* Money, state and the two ways to fix it, all on the
                        same line as the cost. Seventeen rows that each took
                        four lines is a page nobody can scan. */}
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="font-mono text-sm font-medium tabular-nums">
                          {formatMoney(expense.amount, expense.currency)}
                        </p>
                        {expense.currency === "USD" ? null : (
                          <p className="text-[11px] text-muted-foreground">
                            {formatUsd(usd)}
                          </p>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className={`shrink-0 font-normal ${STATUS_TONE[expense.status]}`}
                      >
                        {t(locale, STATUS_LABEL[expense.status])}
                      </Badge>
                      {canRecord || canApprove ? (
                        <ExpenseRowActions
                          canReverse={canAdjustLedger}
                          expenseId={expense.id}
                          status={expense.status}
                          currency={expense.currency}
                          accounts={accountOptions}
                          canApprove={canApprove}
                        />
                      ) : null}
                    </div>
                  </div>

                  {expense.status === "VOID" && expense.voidReason ? (
                    <p className="mt-1.5 text-xs text-muted-foreground">
                      {t(locale, "Cancelled:")} {expense.voidReason}
                    </p>
                  ) : null}

                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Paging, only when there is more than one. */}
      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={link({ page: page === 2 ? undefined : String(page - 1) })}
              className="focus-ring rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              ← {t(locale, "Newer")}
            </Link>
          ) : (
            <span />
          )}
          <span className="text-xs text-muted-foreground">
            {t(locale, "Page")} {page} {t(locale, "of")} {pages}
          </span>
          {page < pages ? (
            <Link
              href={link({ page: String(page + 1) })}
              className="focus-ring rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent"
            >
              {t(locale, "Older")} →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}

    </>
  );
}
