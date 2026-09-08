import type { Metadata } from "next";
import Link from "next/link";
import { Paperclip } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { FinanceWorkspaceHeader } from "@/components/app/finance-workspace-header";
import { RecordCostButton } from "@/components/app/record-cost-button";
import { ExpenseRowActions } from "@/components/app/expense-row-actions";
import { LedgerRowFix } from "@/components/app/ledger-row-fix";
import { SearchBox } from "@/components/app/search-box";
import { Badge } from "@/components/ui/badge";
import { activeAccounts } from "@/lib/accounts";
import {
  COMMON_EXPENSES,
  EXPENSE_CATEGORY_LABELS as CATEGORY_LABELS,
  EXPENSE_STATUS_LABELS as STATUS_LABEL,
} from "@/lib/expenses";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import { LIVE_LEG, moneyOutRows } from "@/lib/ledger";
import type { MoneyRow } from "@/lib/money-totals";
import { sumShillings, sumUsd } from "@/lib/money-totals";
import { t } from "@/lib/i18n";
import type { Prisma } from "@prisma/client";
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
  /*
    EVERYTHING MEANS EVERYTHING THAT LEFT.

    This card totalled the Expense table, so it answered "what did we file as a
    cost" while reading as "what went out" — and the two differ by every claim
    paid back to a customer and every delivery fare handed to a driver, neither
    of which is a purchase and neither of which had an expense row. The owner's
    rule is that money out is money out: it is all on this page now, and this
    card is the register's own Money out for the period.
  */
  { key: "all", label: "Everything", hint: "Every shilling that left, cost or not" },
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
  /*
    THE TWO THAT LEAVE A TILL WITHOUT BEING A PURCHASE.

    A claim settled is company money paid back to a customer, recorded on the
    case rather than as a cost. A delivery fare is money the customer sent with
    their freight and the company passed straight on — it was never ours. Both
    are real movements in the register, both are on this page now, and both
    keep their own chip so a reader can see which part of the month was which.
  */
  {
    key: "claims",
    label: "Claims paid",
    hint: "Paid back to customers on a case — recorded there, not as a purchase",
  },
  {
    key: "transport",
    label: "Transport out",
    hint: "The delivery fare passed on to whoever drives — never the company's money",
  },
  /*
    THE LAST THREE, WHICH ARE NOT SPENDING AND SAY SO.

    Everything above is money gone. These three are the questions a desk asks
    next and had to leave the page to answer: what is recorded and still owed,
    what was only carried from one of our own accounts to another, and what
    was withdrawn. None is added into Everything — a bill not yet paid has not
    left, a transfer never left the business, and a cancelled cost is a
    mistake that was taken back.
  */
  {
    key: "unpaid",
    label: "Still to pay",
    hint: "Recorded and approved, and the money has not left yet",
  },
  {
    key: "transfers",
    /* Two words, because the label wraps at five cards across and a chip whose
       figure sits a line lower than its neighbours is the thing a reader
       notices instead of the figures. */
    label: "Between accounts",
    hint: "Carried from one of our own accounts to another — moved, not spent",
  },
  {
    key: "cancelled",
    label: "Cancelled",
    hint: "Withdrawn after being recorded — in the list, in no total",
  },
] as const;

/** The chips that read the register instead of the Expense table. */
const LEDGER_KIND_FOR = {
  claims: "COMPENSATION",
  transport: "TRANSPORT_OUT",
  transfers: "TRANSFER_OUT",
} as const;

/** The chips that ask about a cost's STATE rather than what kind it is. */
const STATUS_KIND_WHERE: Record<string, { status: Prisma.EnumExpenseStatusFilter }> = {
  unpaid: { status: { in: ["PENDING", "APPROVED"] } },
  cancelled: { status: { equals: "VOID" } },
};

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
/*
  How much of a period this page will hold in memory at once.

  The list merges two records that no database can join, so a period's rows
  are sorted and paged here. A few dozen outgoings a month makes this cap
  unreachable in practice; a period that does reach it says so on the page
  rather than quietly showing less than it claims.
*/
const LIST_CAP = 2000;

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
    WHICH OF THE TWO RECORDS THIS VIEW IS READING.

    Costs live in the Expense table. Claims paid and fares passed on live only
    in the register, because neither is a purchase. "Everything" reads both;
    every other chip reads one.

    A category or a status is a fact about a COST — a register leg has neither
    — so choosing either narrows the page to costs, rather than silently
    dropping legs that could never have matched.
  */
  const ledgerKind =
    kind in LEDGER_KIND_FOR
      ? LEDGER_KIND_FOR[kind as keyof typeof LEDGER_KIND_FOR]
      : null;
  const showsCosts = ledgerKind === null;
  const showsLedger =
    (kind === "all" || ledgerKind !== null) && !category && !status;
  /*
    Everything means everything that LEFT. A carry between our own accounts is
    on its own chip because a desk reconciling against the register needs to
    see it, but it never joins the total that says what the business spent.
  */
  const ledgerKindsForAll = ["COMPENSATION", "TRANSPORT_OUT"] as const;

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
            : (STATUS_KIND_WHERE[kind] ?? {});

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
    ledgerOutgoings,
    accounts,
    dispatches,
    recorded,
    paidInWindow,
    unpaid,
    byCategory,
    notACost,
    carries,
    kindTotals,
    rateRow,
    usedMost,
  ] = await Promise.all([
    /*
      THE WHOLE WINDOW, NOT ONE PAGE OF IT.

      The list is two records now — costs, and the register legs that left a
      till without being a purchase — and neither database can sort or page
      the other. So both come back for the period and are merged, sorted and
      paged here, which is the only place that can see both. LIST_CAP is the
      guard on that: this business files a few dozen outgoings a month, and a
      period that ever exceeded the cap says so on the page rather than
      quietly showing less than it claims.
    */
    showsCosts
      ? prisma.expense.findMany({
          where: listWhere,
          orderBy: [{ incurredAt: "desc" }, { createdAt: "desc" }],
          take: LIST_CAP + 1,
          include: {
        account: { select: { name: true } },
        recordedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        batch: { select: { batchNumber: true, id: true } },
        receipts: {
          select: { id: true, url: true, filename: true, contentType: true, bytes: true },
        },
        /* Whether this row already has a ledger line — see LedgerRowFix's
           subject, where a still-unpaid cost simply has none yet. */
        ledgerEntry: { select: { id: true } },
          },
        })
      : Promise.resolve([]),
    /*
      The same period's outgoings from the register: what a claim paid back to
      a customer and a fare handed to a driver actually were, with the account
      each left from. Its own query rather than moneyOutRows because the list
      needs the words on the row, not just the figure — the totals above still
      come from the shared definition, and LIVE_LEG keeps the two asking the
      same question about what counts.
    */
    showsLedger
      ? prisma.ledgerEntry.findMany({
          where: {
            direction: "OUT",
            kind: ledgerKind
              ? ledgerKind
              : { in: ["COMPENSATION", "TRANSPORT_OUT"] },
            ...(inWindow ? { occurredAt: inWindow } : {}),
            ...(accountId ? { accountId } : {}),
            ...(search
              ? {
                  OR: [
                    { description: { contains: search, mode: "insensitive" as const } },
                    { entryNumber: { contains: search, mode: "insensitive" as const } },
                  ],
                }
              : {}),
            ...LIVE_LEG,
          },
          orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
          take: LIST_CAP + 1,
          select: {
            id: true,
            entryNumber: true,
            kind: true,
            description: true,
            occurredAt: true,
            amount: true,
            currency: true,
            amountUsd: true,
            account: { select: { name: true } },
            /* What the row's Correct-or-cancel door needs — the same subject
               the general ledger builds for the same line, so a fare fixed
               from here and one fixed from the register are one action. */
            reversesId: true,
            reversedBy: { select: { id: true } },
            payment: {
              select: {
                id: true,
                reference: true,
                note: true,
                accountId: true,
                voidReason: true,
                voidedBy: { select: { name: true } },
                proofs: {
                  select: {
                    id: true,
                    url: true,
                    filename: true,
                    contentType: true,
                    bytes: true,
                  },
                },
              },
            },
          },
        })
      : Promise.resolve([]),
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
    /*
      MONEY THAT LEFT AND IS NOT ON THIS PAGE.

      A claim paid back to a customer and a delivery fare handed to whoever
      drives both leave a till, and neither is an expense: Finance records the
      first on the case and the second is money that was never the company's.
      So this page's total is smaller than the register's Money out for the
      same month, and a desk that came here to find the difference had nothing
      to read.

      Named underneath the cards rather than added into them. Filing either as
      a cost would put the fare into profit, where it does not belong, and
      would double-count the claim, which is already carried as its own line.
    */
    moneyOutRows({
      ...(from ? { from } : {}),
      kinds: [...ledgerKindsForAll],
    }),
    /* Money carried between our own accounts. Its own chip and never part of
       Everything — it did not leave the business — but a desk reconciling this
       page against the register's Money out needs to see it somewhere. */
    prisma.ledgerEntry.findMany({
      where: {
        direction: "OUT",
        kind: "TRANSFER_OUT",
        ...(inWindow ? { occurredAt: inWindow } : {}),
        ...LIVE_LEG,
      },
      select: { amount: true, currency: true, amountUsd: true },
    }),
    /* One total per kind, so the chips carry their own weight instead of being
       four words a reader has to click to price. */
    Promise.all(
      KINDS.map(async (k) => {
        /* The three that read the register have no Expense rows to group —
           their totals are filled in from the legs, below. */
        if (k.key in LEDGER_KIND_FOR) {
          return { key: k.key, usd: 0, rows: [] as MoneyRow[], count: 0 };
        }
        const where =
          k.key === "flight"
            ? { batchId: { not: null }, expenseClass: "OPERATING" as const }
            : k.key === "office"
              ? { batchId: null, expenseClass: "OPERATING" as const }
              : k.key === "special"
                ? { expenseClass: "NON_OPERATING" as const }
                : k.key === "executive"
                  ? { category: "EXECUTIVE_DRAW" as const }
                  : (STATUS_KIND_WHERE[k.key] ?? {});
        const rows = await prisma.expense.groupBy({
          by: ["currency"],
          where: {
            ...(inWindow ? { incurredAt: inWindow } : {}),
            /* A withdrawn cost is in no total — except the chip whose whole
               job is to say how much was withdrawn, which would otherwise
               read zero and look broken. */
            ...(STATUS_KIND_WHERE[k.key]
              ? {}
              : { status: { not: "VOID" as const } }),
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
  /*
    THE CHIPS THE EXPENSE TABLE CANNOT ANSWER.

    Their own totals, and their weight added into Everything — which is what
    makes that card the register's Money out for the period rather than the
    Expense table's subtotal of it. The four cost chips are untouched: a claim
    is not an office cost and a fare belongs to no batch.
  */
  const claimsBack = notACost.filter((row) => row.kind === "COMPENSATION");
  const faresOut = notACost.filter((row) => row.kind === "TRANSPORT_OUT");
  for (const [key, legs] of [
    ["claims", claimsBack],
    ["transport", faresOut],
    ["transfers", carries],
  ] as const) {
    const chip = kindTotals.find((row) => row.key === key);
    if (!chip) continue;
    chip.rows = legs;
    chip.usd = sumUsd(legs, rate);
    chip.count = legs.length;
  }
  const everything = kindTotals.find((row) => row.key === "all");
  if (everything) {
    everything.rows = [...everything.rows, ...notACost];
    everything.usd = sumUsd(everything.rows, rate);
    everything.count += notACost.length;
  }

  const shillings = (value: number, usdFallback: number) =>
    rate ? `TSh ${Math.round(value).toLocaleString("en-US")}` : formatUsd(usdFallback);

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
  /*
    ONE LIST OUT OF TWO RECORDS.

    A cost is dated by when it was incurred, which is what this page has always
    sorted by; a register leg is dated by when the money moved, which is the
    only date it has. Both are "when this outgoing belongs to the period", so
    they sort together on one field.
  */
  type OutgoingRow =
    | { sort: Date; cost: (typeof expenses)[number]; leg?: undefined }
    | { sort: Date; leg: (typeof ledgerOutgoings)[number]; cost?: undefined };

  const merged: OutgoingRow[] = [
    ...expenses.map((cost) => ({ sort: cost.incurredAt, cost })),
    ...ledgerOutgoings.map((leg) => ({ sort: leg.occurredAt, leg })),
  ].sort((a, b) => b.sort.getTime() - a.sort.getTime());

  /*
    WHY THE CARDS AND THE LIST COUNT DIFFERENTLY.

    A cancelled cost is a mistake that was withdrawn, so it is in no total —
    but it stays in the list, because the page offers a Cancelled filter and a
    register that hides its own corrections is not a record. That left the
    cards saying twelve and the list saying fifteen with nothing to explain
    the three, which reads as a bug. Counted and named instead, the way the
    general ledger names its own.
  */
  const cancelledRows = merged.filter(
    (row) => row.cost?.status === "VOID"
  ).length;

  /* Said out loud rather than silently truncated — see LIST_CAP. */
  const overCap =
    expenses.length > LIST_CAP || ledgerOutgoings.length > LIST_CAP;

  const listCount = merged.length;
  const pageRows = merged.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(listCount / PAGE_SIZE));
  const firstOnPage = listCount === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastOnPage = Math.min(page * PAGE_SIZE, listCount);

  const chip =
    "focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors";

  return (
    <>
      <FinanceWorkspaceHeader role={user.role} />

      {/* What THIS tab is for. The department's name and its
          actions are in the shared header above; this is the one
          sentence that belongs to the list below. */}
      <p className="mb-4 -mt-2 max-w-3xl text-sm text-muted-foreground">
        {t(locale, "What the business spends, and what it has already paid. Costs are dated when they were incurred; the money is dated when it left.")}
      </p>

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
      {/* Two columns or five, never three: ten cards divide cleanly by both,
          and a row with two cards stranded on the end of it is the first
          thing a reader notices about a page of figures. */}
      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-5">
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
            k.key === "claims"
              ? { text: "text-destructive", bar: "bg-destructive", wash: "from-destructive/[0.12]", ring: "ring-destructive/40 border-destructive/40" }
              : k.key === "transport"
                ? { text: "text-success", bar: "bg-success", wash: "from-success/[0.10]", ring: "ring-success/40 border-success/40" }
                : k.key === "unpaid" || k.key === "transfers" || k.key === "cancelled"
                  ? { text: "text-muted-foreground", bar: "bg-muted-foreground/40", wash: "from-muted-foreground/[0.07]", ring: "ring-foreground/20 border-foreground/20" }
                  : k.key === "executive"
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
        — both of which the All costs card already carries, in bigger type,
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
          : `${t(locale, "Showing")} ${firstOnPage}–${lastOnPage} ${t(locale, "of")} ${listCount} ${t(locale, listCount === 1 ? "outgoing" : "outgoings")}`}
        {cancelledRows > 0
          ? ` · ${cancelledRows} ${t(locale, "cancelled, not counted")}`
          : ""}
        {filtered ? ` · ${t(locale, "filtered")}` : ""}
        {overCap ? ` · ${t(locale, "more than this page can hold — narrow the period")}` : ""}
      </p>

      {pageRows.length === 0 ? (
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
            {pageRows.map((row) => {
              /*
                THE REGISTER'S OWN OUTGOINGS, IN THE SAME LIST.

                A claim paid back and a fare passed on left a till exactly as a
                cost does, and the owner's rule is that money out is money out
                — so they are rows here rather than a figure somewhere else.
                They carry no Edit or Cancel: neither was recorded on this
                page, and each is corrected where it was made — the claim on
                its case, the fare on the payment that carried it. The entry
                number is the link to both.
              */
              if (row.leg) {
                const leg = row.leg;
                const claim = leg.kind === "COMPENSATION";
                return (
                  <li key={leg.id} className="px-4 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                      <div className="min-w-0">
                        <p className="font-medium">
                          {leg.description ??
                            t(locale, claim ? "Claim paid" : "Transport out")}
                          <span
                            className={cn(
                              "ml-2 rounded px-1.5 py-0.5 text-[11px] font-normal",
                              claim
                                ? "bg-destructive/15 text-destructive"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {t(
                              locale,
                              claim
                                ? "Paid back on a claim"
                                : "Transport — never the company's money"
                            )}
                          </span>
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                          <Link
                            href={`/app/finance/transactions/${leg.id}`}
                            className="font-mono hover:text-brand"
                          >
                            {leg.entryNumber}
                          </Link>
                          <span>·</span>
                          <span>{formatDate(leg.occurredAt, locale)}</span>
                          {leg.account ? (
                            <>
                              <span>·</span>
                              <span>
                                {t(locale, "paid from")} {leg.account.name}
                              </span>
                            </>
                          ) : null}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <div className="text-right">
                          <p className="font-mono text-sm font-medium tabular-nums">
                            {formatMoney(leg.amount, leg.currency)}
                          </p>
                          <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
                            {formatUsd(toNumber(leg.amountUsd))}
                          </p>
                        </div>
                        {/* A register leg exists BECAUSE the money moved —
                            there is no pending state for one to be in. */}
                        <Badge
                          variant="outline"
                          className={`shrink-0 font-normal ${
                            leg.reversedBy ? STATUS_TONE.VOID : STATUS_TONE.PAID
                          }`}
                        >
                          {t(locale, leg.reversedBy ? "Cancelled" : "Paid")}
                        </Badge>
                        {/*
                          THE SAME DOOR THE REGISTER GIVES THIS LINE.

                          These rows are outgoings like any other and the desk
                          reading them is the desk that wants to fix them, so
                          they get the register's own correct-or-cancel rather
                          than being sent to find the line somewhere else.

                          The FIGURE is not editable from here, and that is
                          deliberate: a fare's box feeds changePaymentAmount,
                          which restates the WHOLE payment — correcting a
                          46,450 transfer from its 10,000 fare would re-record
                          the payment as 10,000 and leave the bill unpaid. The
                          payment's own line is where its figure lives.
                        */}
                        {canAdjustLedger ? (
                          <LedgerRowFix
                            accounts={accountOptions}
                            subject={{
                              entryId: leg.id,
                              paymentId: leg.payment?.id ?? null,
                              paymentReference: leg.payment?.reference ?? null,
                              paymentNote: leg.payment?.note ?? null,
                              paymentAccountId: leg.payment?.accountId ?? null,
                              amount: toNumber(leg.amount),
                              currency: leg.currency,
                              amountEditable: false,
                              expenseId: null,
                              expenseDescription: null,
                              expenseCategory: null,
                              expenseClass: null,
                              expenseVendor: null,
                              expenseNote: null,
                              expenseAccountId: null,
                              expenseBatchId: null,
                              expenseIncurredAt: null,
                              expenseStatus: null,
                              attachments: leg.payment?.proofs ?? [],
                              /* A line already answered by a reversing line has
                                 nothing left to do, and a correction is itself
                                 a line that must not be cancelled in turn. */
                              reversed: Boolean(leg.reversedBy || leg.reversesId),
                              voidReason: leg.payment?.voidReason ?? null,
                              voidedByName: leg.payment?.voidedBy?.name ?? null,
                            }}
                          />
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              }

              const expense = row.cost;
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
                          /* Cancelling and reversing now live in LedgerRowFix
                             below, which — unlike this component's old
                             "Reverse" link — asks for the right one itself
                             rather than always trying the wrong door on a
                             cost that has already been paid. Approve and Pay
                             are the workflow steps that stay here; they move
                             a cost forward rather than correct it. */
                          canReverse={false}
                          expenseId={expense.id}
                          status={expense.status}
                          currency={expense.currency}
                          accounts={accountOptions}
                          canApprove={canApprove}
                        />
                      ) : null}
                      {canAdjustLedger && expense.status !== "VOID" ? (
                        <LedgerRowFix
                          accounts={accountOptions}
                          subject={{
                            /* Never read for an expense subject — see the
                               type's own note — so the expense's own id
                               stands in for the rows that have no ledger
                               line yet (still PENDING or APPROVED). */
                            entryId: expense.ledgerEntry?.id ?? expense.id,
                            paymentId: null,
                            paymentReference: null,
                            paymentNote: null,
                            paymentAccountId: null,
                            amount: toNumber(expense.amount),
                            currency: expense.currency,
                            amountEditable: false,
                            expenseId: expense.id,
                            expenseDescription: expense.description,
                            expenseCategory: expense.category,
                            expenseClass: expense.expenseClass,
                            expenseVendor: expense.vendor,
                            expenseNote: expense.note,
                            expenseAccountId: expense.accountId,
                            expenseBatchId: expense.batchId,
                            expenseIncurredAt: expense.incurredAt
                              .toISOString()
                              .slice(0, 10),
                            expenseStatus: expense.status,
                            attachments: expense.receipts,
                            reversed: false,
                            voidReason: null,
                            voidedByName: null,
                          }}
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
