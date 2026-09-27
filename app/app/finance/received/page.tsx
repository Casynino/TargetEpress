import Link from "next/link";
import type { Metadata } from "next";
import { Banknote, Clock3, Package, Warehouse } from "lucide-react";

import { FilterChip } from "@/components/app/filter-chip";
import { FinanceWorkspaceHeader } from "@/components/app/finance-workspace-header";
import { SearchBox } from "@/components/app/search-box";
import { Badge } from "@/components/ui/badge";
import { BILLED_INVOICE_STATUSES } from "@/lib/constants";
import { formatDate, formatDateTime, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { formatShillingTotal, formatShillings } from "@/lib/money";
import { rowInShillings, sumShillings } from "@/lib/money-totals";
import {
  receivedByAccount,
  receivedInWindow,
  tenderedInWindow,
} from "@/lib/payment-totals";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { followUpQueue, followUpTotals } from "@/lib/support";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Income") };
}

const PERIODS = [
  /*
    EVERYTHING FIRST.

    It opened on today, which on a quiet morning is an empty page under a
    heading that says Income — the owner's words: "I should see the income
    there, don't filter it to today only". So the register opens as a register,
    and the periods narrow it when somebody wants a day or a month.
  */
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
] as const;

/** Enough of a day's takings to read, few enough to render fast. */
const LIST_CAP = 200;

/**
 * The window the reader asked for, as a half-open pair.
 *
 * Half-open on purpose: a payment taken at 23:59:59 on the last day of the
 * month belongs to that month, and `<= end of day` written with a date is how
 * that payment disappears.
 */
function windowOf(period: string, from?: string, to?: string) {
  const now = new Date();
  /* Before this business existed, so "all time" is a window like any other
     and every figure on the page is summed the one way. */
  const DAWN = new Date(2000, 0, 1);
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = (d: Date, n: number) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  if (from && to) {
    const a = new Date(`${from}T00:00:00`);
    const b = new Date(`${to}T00:00:00`);
    if (!Number.isNaN(a.getTime()) && !Number.isNaN(b.getTime()) && a <= b) {
      return { start: a, end: day(b, 1), custom: true };
    }
  }
  if (period === "all") return { start: DAWN, end: day(midnight, 1), custom: false };
  if (period === "today") return { start: midnight, end: day(midnight, 1), custom: false };
  if (period === "yesterday") {
    return { start: day(midnight, -1), end: midnight, custom: false };
  }
  if (period === "week") {
    // Monday, because a Tanzanian working week is not read Sunday-first.
    const back = (midnight.getDay() + 6) % 7;
    return { start: day(midnight, -back), end: day(midnight, 1), custom: false };
  }
  if (period === "year") {
    return {
      start: new Date(now.getFullYear(), 0, 1),
      end: day(midnight, 1),
      custom: false,
    };
  }
  return {
    start: new Date(now.getFullYear(), now.getMonth(), 1),
    end: day(midnight, 1),
    custom: false,
  };
}

/**
 * INCOME — EVERY SHILLING THAT ACTUALLY ARRIVED.
 *
 * One register of money in, for a period the reader picks: what came in, from
 * whom, against which bill, and which account it landed in.
 *
 * TWO FIGURES THAT ARE NOT THE SAME QUESTION, AND ARE NEVER ADDED.
 * What ARRIVED is a payment: it can honestly be split by the account that
 * received it and by the currency the customer handed over, and by nothing
 * else — a payment answers a bill, never a line on a bill, so no shilling of
 * it can be called freight or storage without inventing an attribution
 * nobody agreed to. What was BILLED is the invoice, which really does have
 * freight, storage and other charges in it. So the takings lead, the
 * composition of the bills sits underneath, and each says which it is.
 *
 * Cancelled payments are not money and a null credited column falls back to
 * what was handed over — both rules live in lib/payment-totals, not here.
 */
export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    from?: string;
    to?: string;
    q?: string;
    account?: string;
    method?: string;
  }>;
}) {
  const user = await requirePermission("accounting.view");
  const locale = await viewerLocale();
  const params = await searchParams;

  const period = PERIODS.some((p) => p.key === params.period)
    ? (params.period as string)
    : "all";
  const { start, end, custom } = windowOf(period, params.from, params.to);
  const search = (params.q ?? "").trim();
  const account = (params.account ?? "").trim();
  const method = (params.method ?? "").trim();

  /* The rate first, because both money totals are summed with it inside the
     database — see receivedInWindow. */
  const rateRow = await currentRate();
  const rate = rateRow ? toNumber(rateRow.rate) : null;

  const [received, byAccount, byCurrency, billed, payments, owing] =
    await Promise.all([
      receivedInWindow(start, end, rate),
      receivedByAccount(start, end, rate),
      tenderedInWindow(start, end),
      /* What the bills raised in the same window were made of. Said as BILLED
         in as many words, because it is not what arrived. */
      prisma.invoice.aggregate({
        where: {
          status: { in: [...BILLED_INVOICE_STATUSES] },
          issuedAt: { gte: start, lt: end },
        },
        _sum: {
          freightCost: true,
          freightOverride: true,
          storageCharge: true,
          otherCharges: true,
          total: true,
        },
      }),
      prisma.payment.findMany({
        where: {
          voidedAt: null,
          paidAt: { gte: start, lt: end },
          ...(account ? { accountId: account } : {}),
          ...(method ? { method: method as never } : {}),
          ...(search
            ? {
                OR: [
                  { reference: { contains: search, mode: "insensitive" as const } },
                  { receipt: { receiptNumber: { contains: search, mode: "insensitive" as const } } },
                  { invoice: { invoiceNumber: { contains: search, mode: "insensitive" as const } } },
                  { invoice: { customer: { name: { contains: search, mode: "insensitive" as const } } } },
                  {
                    invoice: {
                      shipment: {
                        trackingNumber: { contains: search, mode: "insensitive" as const },
                      },
                    },
                  },
                ],
              }
            : {}),
        },
        orderBy: { paidAt: "desc" },
        take: LIST_CAP,
        select: {
          id: true,
          amount: true,
          creditedAmount: true,
          currency: true,
          method: true,
          paidAt: true,
          reference: true,
          receipt: { select: { receiptNumber: true } },
          receivedBy: { select: { name: true } },
          account: { select: { id: true, name: true, accountNumber: true } },
          invoice: {
            select: {
              invoiceNumber: true,
              shipment: { select: { trackingNumber: true } },
              customer: { select: { name: true } },
            },
          },
        },
      }),
      /* What is still out there. Deliberately NOT the period: what a customer
         owes is true right now, whatever window the takings are read over. */
      followUpQueue({ credit: can(user.role, "credit.view") }),
    ]);

  const totals = followUpTotals(owing);
  /* A figure that is only ever dollars — a bill's components, what a customer
     still owes — converts at today's rate. Money that really arrived has its
     own shilling figure and uses `exact` below. */
  const money = (usd: number) => formatShillings(usd, rate);
  const exact = (shillings: number, usd: number) =>
    formatShillingTotal(shillings, usd, rate);

  const freight =
    toNumber(billed._sum.freightOverride ?? 0) > 0
      ? toNumber(billed._sum.freightOverride ?? 0)
      : toNumber(billed._sum.freightCost ?? 0);
  const storage = toNumber(billed._sum.storageCharge ?? 0);
  const other = toNumber(billed._sum.otherCharges ?? 0);

  /** Every control keeps the others, so narrowing never silently resets. */
  const link = (next: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { period, q: search, account, method, from: params.from, to: params.to, ...next };
    for (const [key, value] of Object.entries(merged)) {
      if (value) q.set(key, value);
    }
    const query = q.toString();
    return query ? `/app/finance/received?${query}` : "/app/finance/received";
  };

  const windowLabel = custom
    ? `${formatDate(start, locale)} → ${formatDate(new Date(end.getTime() - 1), locale)}`
    : period === "all"
      ? t(locale, "Everything received")
      : period === "today" || period === "yesterday"
        ? formatDate(start, locale)
        : `${formatDate(start, locale)} → ${formatDate(new Date(end.getTime() - 1), locale)}`;

  /* One day per heading, in the order the money came in. */
  const byDay = new Map<string, typeof payments>();
  for (const row of payments) {
    const key = formatDate(row.paidAt, locale);
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  }

  const chase = owing
    .filter((row) => (row.outstanding ?? 0) > 0)
    .sort((a, b) => (b.credit?.daysOverdue ?? 0) - (a.credit?.daysOverdue ?? 0))
    .slice(0, 6);

  return (
    <>
      <FinanceWorkspaceHeader
        role={user.role}
        title={t(locale, "Income")}
        description={t(
          locale,
          "Every shilling received from customers, and the account it landed in. Cargo is what this business sells, so this is the freight and storage its customers paid for."
        )}
      />

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">{windowLabel}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {PERIODS.map((item) => (
            <FilterChip
              key={item.key}
              href={link({ period: item.key, from: undefined, to: undefined })}
              active={!custom && period === item.key}
            >
              {t(locale, item.label)}
            </FilterChip>
          ))}
          {/* A window nobody thought to offer. Plain GET, so it survives a
              reload and can be sent to somebody as a link. */}
          <form className="flex items-center gap-1.5 text-xs" action="/app/finance/received">
            <input type="hidden" name="period" value={period} />
            {search ? <input type="hidden" name="q" value={search} /> : null}
            {account ? <input type="hidden" name="account" value={account} /> : null}
            {method ? <input type="hidden" name="method" value={method} /> : null}
            <input
              type="date"
              name="from"
              aria-label={t(locale, "From")}
              defaultValue={params.from ?? ""}
              className="focus-ring h-8 rounded-lg border bg-card px-2"
            />
            <span className="text-muted-foreground">→</span>
            <input
              type="date"
              name="to"
              aria-label={t(locale, "To")}
              defaultValue={params.to ?? ""}
              className="focus-ring h-8 rounded-lg border bg-card px-2"
            />
            <button className="focus-ring h-8 rounded-lg bg-foreground px-3 font-medium text-background">
              {t(locale, "Show")}
            </button>
          </form>
        </div>
      </div>

      {/* THE TAKINGS. */}
      <section className="rounded-2xl border border-brand/30 bg-gradient-to-br from-brand/10 to-card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t(locale, "Income received")}
            </p>
            <p className="mt-2 font-display text-3xl font-bold tabular">
              {exact(received.shillings, received.usd)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {received.count}{" "}
              {received.count === 1 ? t(locale, "payment") : t(locale, "payments")} ·{" "}
              {t(locale, "cancelled ones taken off")}
            </p>
          </div>
          {byAccount.length > 0 ? (
            <div className="flex max-w-2xl flex-wrap justify-end gap-1.5">
              {byAccount.map((row) => (
                <Link
                  key={row.accountId ?? "none"}
                  href={link({ account: row.accountId === account ? undefined : row.accountId ?? undefined })}
                  className={`focus-ring rounded-full border px-2.5 py-1 text-[11px] font-medium tabular transition-colors ${
                    account && row.accountId === account
                      ? "border-foreground bg-foreground text-background"
                      : "bg-card hover:bg-accent"
                  }`}
                >
                  {row.name ?? t(locale, "Not said where it went")} ·{" "}
                  {exact(row.shillings, row.usd)}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      {/* WHAT THE BILLS WERE MADE OF — billed, not collected. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Freight billed",
            hint: "What the rate book charged to fly it",
            value: freight,
            Icon: Package,
          },
          {
            label: "Storage billed",
            hint: "Days past the free week, at the daily rate",
            value: storage,
            Icon: Warehouse,
          },
          {
            label: "Other charges billed",
            hint: "Anything added to a bill by hand",
            value: other,
            Icon: Banknote,
          },
          {
            label: "Tendered in shillings",
            hint: "What customers actually handed over, before any conversion",
            value: null as number | null,
            Icon: Clock3,
          },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl border bg-card p-4 shadow-soft">
            <div className="flex items-center gap-2">
              <tile.Icon className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs font-medium text-muted-foreground">
                {t(locale, tile.label)}
              </p>
            </div>
            <p className="mt-1.5 font-display text-xl font-bold tabular">
              {tile.value === null
                ? (() => {
                    const shillings = byCurrency.find((row) => row.currency === "TZS");
                    return shillings
                      ? `TSh ${Math.round(shillings.tendered).toLocaleString("en-US")}`
                      : "—";
                  })()
                : money(tile.value)}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t(locale, tile.hint)}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2 [&>form]:min-w-0 [&>form]:flex-1">
            <SearchBox
              placeholder={t(locale, "Customer, tracking number, receipt, reference…")}
              defaultValue={search}
              suggestions={[]}
            />
            {/* The account is narrowed by pressing its chip on the takings
                card above, which is the same control in the place the reader
                is already looking at the figure. */}
            {account ? (
              <Link
                href={link({ account: undefined })}
                className="focus-ring inline-flex h-9 items-center rounded-lg border px-3 text-xs font-medium hover:bg-accent"
              >
                {t(locale, "Every account")}
              </Link>
            ) : null}
          </div>

          {payments.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
              {t(locale, "Nothing came in over this period.")}
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
              {[...byDay.entries()].map(([day, rows]) => {
                /* Shillings stay shillings; a dollar payment converts once.
                   The same rule the takings card is summed with. */
                const asMoney = rows.map((row) => ({
                  currency: row.currency,
                  amount: row.amount,
                  amountUsd: row.creditedAmount ?? row.amount,
                }));
                const dayShillings = sumShillings(asMoney, rate);
                const dayUsd = asMoney.reduce(
                  (n, row) => n + toNumber(row.amountUsd),
                  0
                );
                return (
                  <div key={day}>
                    <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2">
                      <p className="text-sm font-semibold">
                        {day}{" "}
                        <span className="font-normal text-muted-foreground">
                          {rows.length}{" "}
                          {rows.length === 1 ? t(locale, "line") : t(locale, "lines")}
                        </span>
                      </p>
                      <p className="text-sm font-semibold tabular text-success">
                        {exact(dayShillings, dayUsd)}
                      </p>
                    </div>
                    {rows.map((row) => (
                      <div
                        key={row.id}
                        className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
                          <Package className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                            <span className="truncate">
                              {row.invoice?.customer.name ?? t(locale, "Not attributed")}
                            </span>
                            {row.invoice?.shipment?.trackingNumber ? (
                              <Badge variant="secondary">
                                {row.invoice.shipment.trackingNumber}
                              </Badge>
                            ) : null}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {formatDateTime(row.paidAt, locale).slice(-5)} ·{" "}
                            {row.receipt?.receiptNumber ?? t(locale, "no receipt")}
                            {row.invoice?.invoiceNumber
                              ? ` · ${row.invoice.invoiceNumber}`
                              : ""}
                            {row.receivedBy?.name
                              ? ` · ${t(locale, "by")} ${row.receivedBy.name}`
                              : ""}
                          </p>
                        </div>
                        <div className="min-w-0 text-right">
                          <p className="truncate text-sm">
                            {row.account?.name ?? t(locale, "Not said where it went")}
                          </p>
                          {row.account?.accountNumber ? (
                            <p className="truncate font-mono text-[11px] text-muted-foreground">
                              {row.account.accountNumber}
                            </p>
                          ) : null}
                        </div>
                        {/* The amount is never edited here — a payment that
                            was wrong is cancelled and re-recorded, and the
                            account it landed in is corrected on its own page. */}
                        <Link
                          href={`/app/finance/payments/${row.id}`}
                          className="focus-ring shrink-0 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-accent"
                        >
                          {t(locale, "Open")}
                        </Link>
                        <p className="w-28 shrink-0 text-right font-display text-base font-bold tabular">
                          {exact(
                            rowInShillings(
                              {
                                currency: row.currency,
                                amount: row.amount,
                                amountUsd: row.creditedAmount ?? row.amount,
                              },
                              rate
                            ),
                            toNumber(row.creditedAmount ?? row.amount)
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                );
              })}
              {payments.length === LIST_CAP ? (
                <p className="border-t px-4 py-2 text-center text-xs text-muted-foreground">
                  {t(locale, "Showing the most recent")} {LIST_CAP}{" "}
                  {t(locale, "payments of this period — narrow the dates to see the rest.")}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* WHAT IS STILL OUT THERE — right now, not over the period. */}
        <aside className="rounded-xl border border-warning/30 bg-warning/5 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <Clock3 className="h-4 w-4 text-warning" />
            {t(locale, "To collect")}
          </p>
          {/*
            TWO FIGURES, NEVER ONE.

            A bill nobody has paid and money the company agreed to wait for are
            different positions, and a single "owed" total hides which of the
            two this business is carrying.
          */}
          <p className="mt-2 font-display text-2xl font-bold tabular">
            {money(totals.cashUsd)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(locale, "Billed and not paid")}
          </p>
          {totals.creditUsd > 0 ? (
            <p className="mt-2 text-sm">
              <span className="font-semibold tabular">{money(totals.creditUsd)}</span>{" "}
              <span className="text-xs text-muted-foreground">
                {t(locale, "on credit we agreed to wait for")}
              </span>
            </p>
          ) : null}
          <p className="mt-2 text-xs text-muted-foreground">
            {t(locale, "It becomes income only when the money is actually received.")}
          </p>

          <div className="mt-3 space-y-2">
            {chase.map((row) => (
              <div key={row.id} className="rounded-lg border bg-card p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{row.customerName}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {row.trackingNumber ?? row.invoiceNumber ?? ""}
                      {(row.credit?.daysOverdue ?? 0) > 0 ? (
                        <span className="ml-1 font-medium text-destructive">
                          · {t(locale, "overdue")}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <p className="shrink-0 text-sm font-semibold tabular">
                    {money(row.outstanding ?? 0)}
                  </p>
                </div>
                {row.invoiceId ? (
                  <Link
                    href={`/app/collections/record/${row.invoiceId}`}
                    className="focus-ring mt-1 inline-block text-[11px] font-medium text-brand hover:underline"
                  >
                    {t(locale, "Take payment")} →
                  </Link>
                ) : null}
              </div>
            ))}
          </div>

          {owing.length > chase.length ? (
            <Link
              href="/app/collections/follow-up"
              className="focus-ring mt-3 block rounded-lg border bg-card py-2 text-center text-xs font-medium hover:bg-accent"
            >
              {t(locale, "Show all")} {owing.length}
            </Link>
          ) : null}
        </aside>
      </div>
    </>
  );
}
