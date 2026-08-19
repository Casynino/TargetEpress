import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { Ban, ChevronRight, Paperclip, Pencil } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { IconHint } from "@/components/app/icon-hint";
import { PageHeader } from "@/components/app/page-header";
import { LedgerFilters } from "@/components/app/ledger-filters";
import { RecordCostButton } from "@/components/app/record-cost-button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { activeAccounts } from "@/lib/accounts";
import { RecordIncome } from "@/components/app/record-income";
import { creditNotInTheLedger } from "@/lib/credit-queries";
import {
  COMMON_EXPENSES,
  EXPENSE_CATEGORY_LABELS,
} from "@/lib/expenses";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { cargoText, selectText, viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "The Ledger") };
}

const KIND_LABEL: Record<string, string> = {
  OPENING_BALANCE: "Opening balance",
  CUSTOMER_PAYMENT: "Freight payment",
  EXPENSE: "Expense",
  COMPENSATION: "Compensation",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  ADJUSTMENT: "Adjustment",
};

const PAGE_SIZE = 60;

function windowStart(period: string | undefined): Date | null {
  const now = new Date();
  if (period === "today") {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }
  if (period === "week") {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }
  if (period === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === "year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

/**
 * The general ledger: one register for every movement of money.
 *
 * This replaces three pages. Payments-in listed the money coming in, Expenses
 * listed the money going out, and Money-in-and-out listed both again — three
 * readings of one fact, each with its own totals that somebody then had to
 * reconcile in their head. Income here comes from one place, freight, and it
 * goes out on running the business. A single register says that, once.
 *
 * Debit and credit are separate columns because that is how a ledger is read:
 * the eye runs down one column for what left and the other for what came in.
 * The running balance is why the register is worth keeping — it can be read
 * straight down against a bank statement.
 *
 * Recording a cost lives here too. The place you watch money leave is the place
 * you write down money leaving.
 */
export default async function LedgerPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    account?: string;
    direction?: string;
    kind?: string;
    category?: string;
    person?: string;
    period?: string;
    page?: string;
    /** ?income=1 opens the income panel on arrival, for Home's shortcut. */
    income?: string;
  }>;
}) {
  const user = await requirePermission("ledger.view");
  /* Correcting the register: Finance and the owner, per ledger.adjust. */
  const canFix = can(user.role, "ledger.adjust");
  const locale = await viewerLocale();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const canRecord = can(user.role, "expense.record");
  /* Money in is a different permission from money out: the desk that records
     costs is not automatically the desk that takes customers' payments. */
  const canTakeMoney = can(user.role, "payment.record");

  const where: Prisma.LedgerEntryWhereInput = {};
  if (params.account) where.accountId = params.account;
  if (params.direction === "IN" || params.direction === "OUT") {
    where.direction = params.direction;
  }
  if (params.kind && params.kind in KIND_LABEL) {
    where.kind = params.kind as Prisma.LedgerEntryWhereInput["kind"];
  }
  if (params.person) where.recordedById = params.person;
  if (params.category) {
    where.expense = { category: params.category as never };
  }
  const from = windowStart(params.period);
  if (from) where.occurredAt = { gte: from };

  // One box for anything somebody half-remembers.
  //
  // Nobody looking for a payment remembers which field the thing they remember
  // lives in. They remember the customer, or the tracking number off the label,
  // or the M-Pesa code on the message, or roughly what the cargo was. Every one
  // of those reaches the same line, so there is nothing to know before typing.
  const q = params.q?.trim();
  if (q) {
    const like = { contains: q, mode: "insensitive" as const };
    where.OR = [
      // The line itself
      { description: like },
      { entryNumber: like },
      { account: { name: like } },
      { recordedBy: { name: like } },
      // Freight coming in — receipt, reference, customer, cargo
      { payment: { reference: like } },
      { payment: { note: like } },
      { payment: { receipt: { receiptNumber: like } } },
      { payment: { receivedBy: { name: like } } },
      { payment: { invoice: { invoiceNumber: like } } },
      { payment: { invoice: { customer: { name: like } } } },
      { payment: { invoice: { customer: { phone: like } } } },
      { payment: { invoice: { shipment: { trackingNumber: like } } } },
      { payment: { invoice: { shipment: { description: like } } } },
      // Costs going out
      { expense: { expenseNumber: like } },
      { expense: { description: like } },
      { expense: { vendor: like } },
      { expense: { batch: { batchNumber: like } } },
      // Money moved between our own accounts
      { transfer: { transferNumber: like } },
      { transfer: { reason: like } },
      { transfer: { fromAccount: { name: like } } },
      { transfer: { toAccount: { name: like } } },
    ];
  }

  const [
    accounts,
    people,
    entries,
    total,
    totals,
    rateRow,
    unpaid,
    unpaidByKind,
    credit,
  ] = await Promise.all([
      activeAccounts(),
      prisma.user.findMany({
        where: { ledgerEntries: { some: {} } },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.ledgerEntry.findMany({
        where,
        orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          account: { select: { id: true, name: true, currency: true } },
          recordedBy: { select: { name: true } },
          payment: {
            select: {
              reference: true,
              receipt: { select: { receiptNumber: true } },
              proofs: { select: { url: true }, take: 1 },
              invoice: {
                select: {
                  customer: { select: { name: true } },
                  /* Which side of §13 this line is on. A payment against a bill
                     that was released on credit is a debt being settled, not a
                     sale — same ledger kind, opposite meaning. */
                  creditStatus: true,
                  // What the customer actually shipped. This is the answer to
                  // "what was this payment for", and it was not being asked for.
                  shipment: {
                    select: {
                      trackingNumber: true,
                      ...selectText("description"),
                    },
                  },
                },
              },
            },
          },
          expense: {
            select: {
              expenseNumber: true,
              description: true,
              vendor: true,
              category: true,
              receipts: { select: { url: true }, take: 1 },
            },
          },
          transfer: {
            select: {
              transferNumber: true,
              reason: true,
              fromAccount: { select: { name: true } },
              toAccount: { select: { name: true } },
            },
          },
        },
      }),
      prisma.ledgerEntry.count({ where }),
      prisma.ledgerEntry.groupBy({
        by: ["direction"],
        where,
        _sum: { amountUsd: true },
      }),
      currentRate(),
      // Costs recorded but not yet disbursed have no ledger line, because no
      // money has moved. They still have to be visible somewhere.
      prisma.expense.aggregate({
        where: { status: { in: ["PENDING", "APPROVED"] } },
        _sum: { amountUsd: true },
        _count: true,
      }),
      /* Broken down, because the total alone is a mystery. Thirty-four
         million against a handful of clearing costs looks wrong until you
         know it is payroll — so the line says which kind of cost it mostly
         is, and the reader stops having to guess. */
      prisma.expense.groupBy({
        by: ["category"],
        where: { status: { in: ["PENDING", "APPROVED"] } },
        _sum: { amountUsd: true },
        _count: true,
      }),
      /* Revenue this register cannot hold, for the same reason the unpaid costs
         above are not in it: no money has moved. Asked only of a desk allowed to
         read the credit book — ledger.view and credit.view happen to travel
         together today, and a figure never fetched cannot leak if they stop. */
      can(user.role, "credit.view")
        ? creditNotInTheLedger()
        : Promise.resolve(null),
    ]);

  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const inUsd = toNumber(
    totals.find((t) => t.direction === "IN")?._sum.amountUsd ?? 0
  );
  const outUsd = toNumber(
    totals.find((t) => t.direction === "OUT")?._sum.amountUsd ?? 0
  );
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const single = accounts.find((a) => a.id === params.account) ?? null;

  // The running balance.
  //
  // Down one account it is that account's own currency. Across all of them it
  // has to be one unit or it is nonsense, so it accumulates in USD and is shown
  // in shillings — the same conversion every other figure here uses.
  const oldest = entries[entries.length - 1];
  let opening = 0;
  if (oldest) {
    const before = await prisma.ledgerEntry.groupBy({
      by: ["direction"],
      where: {
        ...(params.account ? { accountId: params.account } : {}),
        OR: [
          { occurredAt: { lt: oldest.occurredAt } },
          { occurredAt: oldest.occurredAt, createdAt: { lt: oldest.createdAt } },
        ],
      },
      _sum: { amount: true, amountUsd: true },
    });
    const pick = (dir: "IN" | "OUT") => {
      const row = before.find((r) => r.direction === dir);
      return toNumber((single ? row?._sum.amount : row?._sum.amountUsd) ?? 0);
    };
    opening = pick("IN") - pick("OUT");
  }

  const runningById = new Map<string, number>();
  let running = opening;
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i];
    const value = single ? toNumber(entry.amount) : toNumber(entry.amountUsd);
    running += (entry.direction === "IN" ? 1 : -1) * value;
    runningById.set(entry.id, running);
  }

  const tsh = (usd: number) =>
    rate ? `TSh ${Math.round(usd * rate).toLocaleString("en-US")}` : formatUsd(usd);
  const showBalance = (value: number) =>
    single ? formatMoney(value, single.currency) : tsh(value);

  /**
   * What KIND of transaction a line is, in the words the business uses.
   *
   * The interesting distinction is not in `kind` — it is inside
   * CUSTOMER_PAYMENT, and this column could not see it. Money handed over at the
   * counter for cargo is a SALE. Money handed over against a bill released on
   * credit three weeks ago is a debt being SETTLED: the sale already happened,
   * off this register, and reading it as a second sale would count the same
   * revenue twice in one month. Same kind, same account, opposite meaning, so
   * the answer comes from the invoice's credit status rather than from `kind`.
   *
   * §13 also names a REFUND type, and this schema has no such instrument. Money
   * genuinely going back to a customer is a cost — filed under Customer
   * compensation, the claim payout — and it already reads as that here. What is
   * NOT a refund is a reversing line, however much it looks like one: those come
   * from voiding a payment that should never have been recorded, the wrong
   * customer or the wrong bill or money that never cleared, so the figure comes
   * back out of the account it went into and usually nowhere near the customer.
   * Labelling that "Refund" would tell the reader the company paid somebody.
   * Either way this column said "Freight income" on it — money arriving, on the
   * row where it left.
   *
   * An expense keeps its category instead of the word "Expense". "Customs" is an
   * expense type and a more useful one, and the red debit column has already
   * said which way the money went.
   */
  const typeOf = (entry: (typeof entries)[number]) => {
    if (entry.reversesId) return t(locale, "Correction");
    if (entry.expense) {
      return t(
        locale,
        EXPENSE_CATEGORY_LABELS[entry.expense.category] ?? entry.expense.category
      );
    }
    if (entry.payment) {
      return entry.payment.invoice.creditStatus === "APPROVED"
        ? t(locale, "Credit payment")
        : t(locale, "Cash sale");
    }
    if (entry.transfer) return t(locale, "Between accounts");
    return t(locale, KIND_LABEL[entry.kind] ?? entry.kind);
  };

  const pageLink = (nextPage: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "page") next.set(key, String(value));
    }
    if (nextPage > 1) next.set("page", String(nextPage));
    const qs = next.toString();
    return qs ? `/app/finance/transactions?${qs}` : "/app/finance/transactions";
  };

  return (
    <>
      <PageHeader
        title={t(locale, "The Ledger")}
        description={t(
          locale,
          "Every movement of money — freight collected, costs paid, transfers between accounts — with its account, who recorded it, and a running balance."
        )}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canTakeMoney ? (
              <RecordIncome
                accounts={accounts.map((a) => ({
                  id: a.id,
                  name: a.name,
                  currency: a.currency,
                  accountNumber: a.accountNumber,
                }))}
                rate={rate}
                /* Home links straight in with the panel already open. */
                autoOpen={params.income === "1"}
              />
            ) : null}
            {canRecord ? (
            <RecordCostButton
              accounts={accounts.map((a) => ({
                id: a.id,
                name: a.name,
                currency: a.currency,
                accountNumber: a.accountNumber,
              }))}
              quick={COMMON_EXPENSES}
              rate={rate}
            />
            ) : null}
          </div>
        }
      />


      <LedgerFilters
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        people={people}
        kinds={Object.entries(KIND_LABEL).map(([value, label]) => ({
          value,
          label: t(locale, label),
        }))}
        categories={Object.entries(EXPENSE_CATEGORY_LABELS).map(
          ([value, label]) => ({ value, label: t(locale, label) })
        )}
      />

      {/*
        In, out and net as cards rather than a line of small type.

        The ledger is the page somebody opens to answer "what did we take and
        what did we spend", and the answer was set in 13px above the table
        while every row of detail below it was louder. These three follow the
        filters, so narrowing to one account or one month re-totals them — a
        card that ignored the filter under it would be worse than no card.
      */}
      <dl className="mb-4 grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
        {[
          {
            k: t(locale, "Money in"),
            v: tsh(inUsd),
            tone: "text-success",
            wash: "from-success/10",
            hint: t(locale, "Freight collected and money moved in"),
          },
          {
            k: t(locale, "Money out"),
            v: tsh(outUsd),
            tone: "text-destructive",
            wash: "from-destructive/10",
            hint: t(locale, "Costs paid and money moved out"),
          },
          {
            k: t(locale, "Net"),
            v: tsh(inUsd - outUsd),
            tone: inUsd - outUsd >= 0 ? "text-foreground" : "text-destructive",
            wash: inUsd - outUsd >= 0 ? "from-brand/10" : "from-destructive/10",
            hint: `${total} ${t(locale, total === 1 ? "movement" : "movements")}`,
          },
        ].map((cell) => (
          <div
            key={cell.k}
            className={`bg-gradient-to-b ${cell.wash} to-transparent bg-card px-5 py-4`}
          >
            <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {cell.k}
            </dt>
            <dd
              className={`mt-1 whitespace-nowrap font-display text-2xl font-bold leading-tight tabular-nums ${cell.tone}`}
            >
              {cell.v}
            </dd>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{cell.hint}</p>
          </div>
        ))}
      </dl>

      {/*
        Costs still to pay, said in words that do not fight each other.

        It read "recorded but not yet paid, so not in the register", which
        states a fact and then withdraws it in the same breath — the owner
        could not tell whether it was money coming in or going out. It is
        neither yet: these are bills the business has written down and not
        settled, so no money has moved and nothing above can include them.
        The line now says what they are, then why they are not in the totals.
      */}
      {unpaid._count > 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">
          <Link
            href="/app/finance/transactions?kind=EXPENSE"
            className="font-medium text-warning hover:underline"
          >
            {tsh(toNumber(unpaid._sum.amountUsd))} {t(locale, "in costs still to pay")}
          </Link>
          {" — "}
          {(() => {
            const biggest = [...unpaidByKind].sort(
              (a, b) => toNumber(b._sum.amountUsd) - toNumber(a._sum.amountUsd)
            )[0];
            if (!biggest) return null;
            const label = t(
              locale,
              EXPENSE_CATEGORY_LABELS[biggest.category] ?? biggest.category
            ).toLowerCase();
            const share =
              toNumber(biggest._sum.amountUsd) / toNumber(unpaid._sum.amountUsd);
            return (
              <>
                {unpaidByKind.length === 1 || share > 0.6
                  ? `${t(locale, "mostly")} ${label}`
                  : `${unpaid._count} ${t(locale, unpaid._count === 1 ? "cost" : "costs")}`}
                {", "}
              </>
            );
          })()}
          {t(
            locale,
            "money the business owes. Not counted above, because none of it has left an account yet."
          )}
        </p>
      ) : null}

      {/*
        Where a credit sale is, given this register cannot hold one.

        A credit sale posts no ledger entry, and it must not: the cargo went, the
        revenue is real and no account was touched, so a row for it would put a
        figure into a running balance that no bank statement will ever show. The
        register stays a cash register.

        What it cannot do is stay silent. Somebody totalling Money in above and
        calling it "what we sold" is wrong by exactly this much, and an absence
        nobody explains reads as a missing row. So the gap is named, with the
        amount, and it says where those sales do live.

        The collected half of a credit IS above — as a payment, dated the day the
        money actually arrived. Those are the lines typed "Credit payment" rather
        than "Cash sale", which is the whole point of §13's distinction.
      */}
      {credit && (credit.outstandingUsd > 0.005 || credit.waivedUsd > 0.005) ? (
        <p className="mb-4 text-sm text-muted-foreground">
          {credit.outstandingUsd > 0.005 ? (
            <>
              <Link
                href="/app/finance/credit"
                className="font-medium text-brand hover:underline"
              >
                {tsh(credit.outstandingUsd)}{" "}
                {t(locale, "billed on credit and still owed")}
              </Link>
              {" — "}
              {credit.count}{" "}
              {t(locale, credit.count === 1 ? "credit sale" : "credit sales")}
              {credit.overdueCount > 0 ? (
                <span className="font-medium text-destructive">
                  {", "}
                  {credit.overdueCount} {t(locale, "overdue")}
                </span>
              ) : null}
              {". "}
              {t(
                locale,
                "None of it is in this register: a credit sale moves no money, so it touches no account. It appears here as a credit payment on the day the customer pays."
              )}{" "}
            </>
          ) : null}
          {/* Forgiven debt is out of exposure but never out of sight, and it has
              its own condition rather than riding on the line above: a month
              where the desk wrote off millions and collected everything else
              would otherwise print nothing at all and read like a quiet one. */}
          {credit.waivedUsd > 0.005 ? (
            <span className="text-warning">
              {tsh(credit.waivedUsd)}{" "}
              {t(
                locale,
                "of credit has been written off, and that never appears here at all."
              )}
            </span>
          ) : null}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          title={
            q
              ? `${t(locale, "Nothing matches")} “${q}”`
              : t(locale, "No movements yet")
          }
          description={
            q
              ? t(locale, "Try a shorter search, or clear the filters.")
              : t(
                  locale,
                  "Every payment, cost and transfer writes a line here as it happens."
                )
          }
        />
      ) : (
        <>
        {/*
          A ledger on a phone.

          Nothing was hidden here — unlike the payments table, this one scrolls
          sideways, so every column was reachable. But a register is read down
          the balance, and you cannot follow a balance you have to swipe to see.
          Ten columns on a 375px screen is a spreadsheet somebody is panning
          around, not a page.

          So below `md`: one line per entry with what it was and what it moved,
          the running balance directly under the amount, and the codes on a
          third line for anyone matching a receipt in their hand. The same
          derivation as the table below — title, purpose, refs and category are
          computed once per entry in both, from the same fields.
        */}
        <ul className="divide-y overflow-hidden rounded-xl border bg-card md:hidden">
          {entries.map((entry) => {
            const inbound = entry.direction === "IN";
            const amount = formatMoney(toNumber(entry.amount), entry.currency);

            let title = entry.description;
            let purpose: string | null = null;
            if (entry.payment) {
              title = entry.payment.invoice.customer.name;
              purpose = cargoText(
                locale,
                entry.payment.invoice.shipment,
                "description"
              );
            } else if (entry.expense) {
              title = entry.expense.description;
              purpose = entry.expense.vendor
                ? `${t(locale, "paid to")} ${entry.expense.vendor}`
                : null;
            } else if (entry.transfer) {
              title = inbound
                ? `${t(locale, "In from")} ${entry.transfer.fromAccount.name}`
                : `${t(locale, "Out to")} ${entry.transfer.toAccount.name}`;
              purpose = entry.transfer.reason;
            }

            const refs = [
              entry.payment?.receipt?.receiptNumber ??
                entry.expense?.expenseNumber ??
                entry.transfer?.transferNumber ??
                entry.entryNumber,
              entry.payment?.invoice.shipment.trackingNumber,
            ].filter((v): v is string => Boolean(v));

            return (
              <li key={entry.id} className="relative">
                <Link
                  href={`/app/finance/transactions/${entry.id}`}
                  className={cn(
                    "block p-4 transition-colors hover:bg-accent/40",
                    entry.expense?.category === "EXECUTIVE_DRAW" &&
                      "bg-warning/[0.07] shadow-[inset_3px_0_0_0_hsl(var(--warning))]"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {entry.expense?.category === "EXECUTIVE_DRAW" ? (
                          <span className="mr-1.5 rounded bg-warning px-1.5 py-0.5 text-[10px] font-bold text-warning-foreground">
                            {t(locale, "Executive draw")}
                          </span>
                        ) : null}
                        {title}
                      </p>
                      {purpose ? (
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                          {purpose}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={
                          inbound
                            ? "font-mono text-sm font-semibold tabular text-success"
                            : "font-mono text-sm font-semibold tabular text-destructive"
                        }
                      >
                        {inbound ? "+" : "−"}
                        {amount}
                      </p>
                      {/* The balance under the movement, which is the pair a
                          register is actually read in. */}
                      <p className="mt-0.5 font-mono text-xs tabular text-muted-foreground">
                        {showBalance(runningById.get(entry.id) ?? 0)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span>{formatDate(entry.occurredAt, locale)}</span>
                    <span aria-hidden>·</span>
                    {/* The type belongs on the phone too. It is the difference
                        between a sale and a debt being settled, and hiding it on
                        small screens the way the table's column used to hide it
                        below lg left the two looking identical to whoever was
                        holding the phone. */}
                    <span className="font-medium text-foreground">
                      {typeOf(entry)}
                    </span>
                    <span aria-hidden>·</span>
                    <span className="truncate">{entry.account.name}</span>
                    {refs.map((ref) => (
                      <span key={ref} className="whitespace-nowrap font-mono text-muted-foreground/70">
                        {ref}
                      </span>
                    ))}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>

        <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "Date")}</TableHead>
                <TableHead>{t(locale, "Description")}</TableHead>
                {/* Visible from md rather than lg. The difference between a cash
                    sale and a credit payment changes what the figure beside it
                    means, and a classification that disappears on a laptop is
                    not one. */}
                <TableHead className="hidden md:table-cell">
                  {t(locale, "Type")}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t(locale, "Account")}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t(locale, "By")}
                </TableHead>
                <TableHead className="text-right">{t(locale, "Debit")}</TableHead>
                <TableHead className="text-right">
                  {t(locale, "Credit")}
                </TableHead>
                <TableHead className="text-right">
                  {t(locale, "Balance")}
                </TableHead>
                <TableHead className="hidden sm:table-cell text-right">
                  {t(locale, "Proof")}
                </TableHead>
                {canFix ? (
                  <TableHead className="w-20 text-right">
                    {t(locale, "Fix")}
                  </TableHead>
                ) : null}
                <TableHead className="w-8" aria-label={t(locale, "Open")} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const inbound = entry.direction === "IN";
                const amount = formatMoney(toNumber(entry.amount), entry.currency);
                const proof =
                  entry.payment?.proofs[0]?.url ??
                  entry.expense?.receipts[0]?.url ??
                  null;

                /**
                 * Who the line is about, and — separately — what it was for.
                 *
                 * Two different questions, and the register was only answering
                 * the first. A cost paid to "Shell" said nothing about being
                 * fuel; a payment gave the customer's name and never said which
                 * cargo it cleared, which is the one thing anybody looking at a
                 * freight payment actually needs.
                 */
                let title = entry.description;
                let purpose: string | null = null;

                if (entry.payment) {
                  title = entry.payment.invoice.customer.name;
                  purpose = cargoText(
                    locale,
                    entry.payment.invoice.shipment,
                    "description"
                  );
                } else if (entry.expense) {
                  title = entry.expense.description;
                  purpose = entry.expense.vendor
                    ? `${t(locale, "paid to")} ${entry.expense.vendor}`
                    : null;
                } else if (entry.transfer) {
                  title = inbound
                    ? `${t(locale, "In from")} ${entry.transfer.fromAccount.name}`
                    : `${t(locale, "Out to")} ${entry.transfer.toAccount.name}`;
                  purpose = entry.transfer.reason;
                }

                // Every code that could be quoted back at you. Kept as a
                // list, not one joined string: these are full of hyphens, and
                // a browser will happily break a line inside TX-000104.
                const refs = [
                  entry.payment?.receipt?.receiptNumber ??
                    entry.expense?.expenseNumber ??
                    entry.transfer?.transferNumber ??
                    entry.entryNumber,
                  entry.payment?.invoice.shipment.trackingNumber,
                  entry.payment?.reference,
                ].filter((v): v is string => Boolean(v));

                /**
                 * One classification per line, and only one.
                 *
                 * This column and a badge beside the description were both
                 * naming the same fact — "Freight payment" next to "Freight
                 * income" — which reads as two things until you work out it is
                 * one. The badge is gone; whether money came in or went out is
                 * already unmistakable from which of the two amount columns
                 * the figure is sitting in.
                 *
                 * So §13's transaction type went into this column rather than
                 * beside it. `typeOf` is the single derivation, shared with the
                 * phone list above, because two implementations of "is this a
                 * sale or a debt being settled" would disagree the first time
                 * one of them was edited.
                 */
                const category = typeOf(entry);

                /*
                  The boss taking money out is marked in gold, and only that.

                  On a register where every debit is already red, a boss
                  withdrawal read exactly like a customs bill — the owner's
                  point. Red is spoken for (money out) and green is spoken for
                  (money in), so this gets the one colour the money columns
                  never use: a gold rail down the edge of the row, a warm tint
                  behind it, and the category as a filled gold pill. It is not
                  a warning and nothing about the figure changes; it is simply
                  the row you can find without reading.
                */
                const bossDraw = entry.expense?.category === "EXECUTIVE_DRAW";

                return (
                  <TableRow
                    key={entry.id}
                    className={cn(
                      "group relative cursor-pointer transition-colors hover:bg-accent/40",
                      bossDraw &&
                        "bg-warning/[0.07] hover:bg-warning/[0.12] shadow-[inset_3px_0_0_0_hsl(var(--warning))]"
                    )}
                  >
                    <TableCell className="whitespace-nowrap py-2.5 text-xs text-muted-foreground">
                      {formatDate(entry.occurredAt, locale)}
                    </TableCell>

                    {/* A floor as well as a ceiling. The table scrolls sideways on a
                        phone anyway, so squeezing this column there buys nothing
                        and costs the codes, which is what somebody standing at the
                        counter with a label in their hand is reading. */}
                    <TableCell className="min-w-[17rem] max-w-[30rem] py-2.5">
                      {/* Stretched over the whole row: a ledger line is one
                          thing, so anywhere on it opens it. Still a single
                          real link, so it is keyboard-reachable and can be
                          opened in a new tab. */}
                      <Link
                        href={`/app/finance/transactions/${entry.id}`}
                        className="block truncate text-sm font-medium after:absolute after:inset-0 after:content-[''] group-hover:text-brand"
                      >
                        {title}
                      </Link>
                      {/* Wraps rather than truncates. Squeezed onto one line a
                          long cargo description and a run of codes compete for
                          it, and whichever loses vanishes outright — which is
                          how "what was this for" disappeared on exactly the
                          narrow screens it matters most on. Two lines when it
                          needs them, one when it does not. Three is the
                          ceiling — enough for a long cargo description and
                          every code beneath it, without one wordy consignment
                          making a row five lines tall. */}
                      <span className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                        {purpose ? <>{purpose} </> : null}
                        {refs.map((ref, i) => (
                          <span key={ref}>
                            {i > 0 || purpose ? "· " : null}
                            <span className="whitespace-nowrap font-mono text-muted-foreground/70">
                              {ref}
                            </span>{" "}
                          </span>
                        ))}
                      </span>
                    </TableCell>

                    <TableCell className="hidden whitespace-nowrap py-2.5 text-xs md:table-cell">
                      {/* The gold already marks these rows; naming the person
                          as well was the colour and the caption doing one job
                          twice — and it is not a word to leave on a screen
                          other people read. */}
                      {bossDraw ? (
                        <span className="inline-flex items-center whitespace-nowrap rounded-full bg-warning px-2 py-0.5 text-[11px] font-bold text-warning-foreground">
                          {category}
                        </span>
                      ) : (
                        category
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell py-2.5 text-xs">
                      <Link
                        href={`/app/finance/accounts/${entry.account.id}`}
                        className="relative z-10 hover:text-brand"
                      >
                        {entry.account.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell py-2.5 text-xs text-muted-foreground">
                      {entry.recordedBy?.name ?? "—"}
                    </TableCell>

                    {/* Two columns, because that is how a ledger is read. */}
                    <TableCell className="whitespace-nowrap py-2.5 text-right font-mono text-sm tabular">
                      {inbound ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="text-destructive">{amount}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2.5 text-right font-mono text-sm tabular">
                      {inbound ? (
                        <span className="text-success">{amount}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2.5 text-right font-mono text-sm font-semibold tabular">
                      {showBalance(runningById.get(entry.id) ?? 0)}
                    </TableCell>

                    <TableCell className="hidden sm:table-cell py-2.5 text-right text-xs">
                      {proof ? (
                        <a
                          href={proof}
                          target="_blank"
                          rel="noreferrer"
                          className="relative z-10 inline-flex items-center gap-1 font-medium text-brand hover:underline"
                        >
                          <Paperclip className="h-3 w-3" />
                          {t(locale, "View")}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>

                    {/*
                      Put a line right without opening it first.

                      Both are links, not one-click actions: the pencil goes to
                      the cost that owns the figure, and the cancel goes to the
                      entry's own page where a reason has to be typed. A
                      one-tap cancel in a dense register is how the wrong row
                      gets reversed on a Friday afternoon.

                      z-10 because the whole row is already a stretched link.
                    */}
                    {canFix ? (
                      <TableCell className="w-20 py-2.5 pr-1 text-right">
                        <span className="relative z-10 inline-flex items-center gap-1">
                          {entry.expense ? (
                            <IconHint label={t(locale, "Edit the cost")}>
                              <Link
                                href={`/app/finance/expenses?q=${entry.expense.expenseNumber}`}
                                aria-label={t(locale, "Edit the cost")}
                                className="focus-ring rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Link>
                            </IconHint>
                          ) : null}
                          <IconHint label={t(locale, "Cancel this movement")}>
                            <Link
                              href={`/app/finance/transactions/${entry.id}`}
                              aria-label={t(locale, "Cancel this movement")}
                              className="focus-ring rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Link>
                          </IconHint>
                        </span>
                      </TableCell>
                    ) : null}

                    <TableCell className="w-8 py-2.5 pr-3 text-right">
                      <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground/50 transition-colors group-hover:text-brand" />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        </>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            {t(locale, "Page")} {page} {t(locale, "of")} {pages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={pageLink(page - 1)}
                className="focus-ring rounded-lg border px-3 py-1.5 hover:bg-accent"
              >
                {t(locale, "Previous")}
              </Link>
            ) : null}
            {page < pages ? (
              <Link
                href={pageLink(page + 1)}
                className="focus-ring rounded-lg border px-3 py-1.5 hover:bg-accent"
              >
                {t(locale, "Next")}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
