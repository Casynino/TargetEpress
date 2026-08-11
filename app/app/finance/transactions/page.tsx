import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { ChevronRight, Paperclip } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { FinanceNav } from "@/components/app/finance-nav";
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
import {
  COMMON_EXPENSES,
  EXPENSE_APPROVAL_THRESHOLD_USD,
  EXPENSE_CATEGORY_LABELS,
} from "@/lib/expenses";
import { financeTabs } from "@/lib/finance-tabs";
import { formatDate, formatMoney, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
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
  }>;
}) {
  const user = await requirePermission("ledger.view");
  const locale = await viewerLocale();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const canRecord = can(user.role, "expense.record");

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

  const [accounts, people, entries, total, totals, rateRow, unpaid] =
    await Promise.all([
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
          canRecord ? (
            <RecordCostButton
              accounts={accounts.map((a) => ({
                id: a.id,
                name: a.name,
                currency: a.currency,
                accountNumber: a.accountNumber,
              }))}
              quick={COMMON_EXPENSES}
              thresholdUsd={EXPENSE_APPROVAL_THRESHOLD_USD}
              rate={rate}
            />
          ) : null
        }
      />

      <FinanceNav tabs={financeTabs(user.role)} />

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

      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-sm">
        <p className="text-muted-foreground">
          {total} {t(locale, total === 1 ? "movement" : "movements")}
          {unpaid._count > 0 ? (
            <>
              {" · "}
              <Link
                href="/app/finance/transactions?kind=EXPENSE"
                className="text-warning hover:underline"
              >
                {tsh(toNumber(unpaid._sum.amountUsd))}{" "}
                {t(locale, "recorded but not yet paid")}
              </Link>
              , {t(locale, "so not in the register")}
            </>
          ) : null}
        </p>
        <p className="flex flex-wrap gap-x-5 font-mono tabular-nums">
          <span>
            <span className="text-muted-foreground">{t(locale, "In")} </span>
            <span className="font-semibold text-success">{tsh(inUsd)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">{t(locale, "Out")} </span>
            <span className="font-semibold text-destructive">{tsh(outUsd)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">{t(locale, "Net")} </span>
            <span className="font-semibold">{tsh(inUsd - outUsd)}</span>
          </span>
        </p>
      </div>

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
                  className="block p-4 transition-colors hover:bg-accent/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{title}</p>
                      {purpose ? (
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
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
                      <p className="mt-0.5 font-mono text-[11px] tabular text-muted-foreground">
                        {showBalance(runningById.get(entry.id) ?? 0)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                    <span>{formatDate(entry.occurredAt, locale)}</span>
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
                <TableHead className="hidden lg:table-cell">
                  {t(locale, "Category")}
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
                 */
                const category = entry.expense
                  ? t(
                      locale,
                      EXPENSE_CATEGORY_LABELS[entry.expense.category] ??
                        entry.expense.category
                    )
                  : entry.kind === "CUSTOMER_PAYMENT"
                    ? t(locale, "Freight income")
                    : entry.transfer
                      ? t(locale, "Between accounts")
                      : t(locale, KIND_LABEL[entry.kind] ?? entry.kind);

                return (
                  <TableRow
                    key={entry.id}
                    className="group relative cursor-pointer transition-colors hover:bg-accent/40"
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
                      <span className="mt-0.5 line-clamp-3 text-[11px] leading-relaxed text-muted-foreground">
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

                    <TableCell className="hidden whitespace-nowrap py-2.5 text-xs lg:table-cell">
                      {category}
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
