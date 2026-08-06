import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { ArrowDownLeft, ArrowUpRight, CircleHelp, Scale } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { FinanceNav } from "@/components/app/finance-nav";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { financeTabs } from "@/lib/finance-tabs";
import { MoneyTile } from "@/components/app/money-tile";
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Money in & out" };

const KIND_LABEL: Record<string, string> = {
  OPENING_BALANCE: "Opening balance",
  CUSTOMER_PAYMENT: "Customer payment",
  EXPENSE: "Expense",
  COMPENSATION: "Compensation",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  ADJUSTMENT: "Adjustment",
};

const PAGE_SIZE = 60;

/**
 * The register: every movement of money, newest first.
 *
 * One row per movement, each traceable back to the document that caused it —
 * a receipt, an expense, a transfer. Nothing on this page is typed by anybody;
 * every line was written by the action that moved the money, inside the same
 * transaction, which is what makes the register worth reading at all.
 *
 * Filters are URL state rather than component state, so a filtered view can be
 * linked to, sent to somebody, and reloaded.
 */
export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    account?: string;
    direction?: string;
    kind?: string;
    page?: string;
  }>;
}) {
  const user = await requirePermission("ledger.view");
  const params = await searchParams;

  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.LedgerEntryWhereInput = {};
  if (params.account) where.accountId = params.account;
  if (params.direction === "IN" || params.direction === "OUT") {
    where.direction = params.direction;
  }
  if (params.kind && params.kind in KIND_LABEL) {
    where.kind = params.kind as Prisma.LedgerEntryWhereInput["kind"];
  }

  const [accounts, entries, total, totals, unbanked, rateRow] = await Promise.all([
    prisma.companyAccount.findMany({
      orderBy: [{ sortOrder: "asc" }],
      select: { id: true, name: true, currency: true },
    }),
    prisma.ledgerEntry.findMany({
      where,
      // The day the money moved, not the day the row was typed. A backdated
      // payment belongs where it happened, or the register cannot be read
      // against a bank statement.
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: {
        account: { select: { name: true, currency: true } },
        recordedBy: { select: { name: true } },
        payment: {
          select: {
            receipt: { select: { receiptNumber: true } },
            invoice: {
              select: { shipment: { select: { trackingNumber: true } } },
            },
          },
        },
      },
    }),
    prisma.ledgerEntry.count({ where }),
    // Summed in USD, because the rows on screen may be in different
    // currencies and a mixed sum is the bug this whole area exists to avoid.
    prisma.ledgerEntry.groupBy({
      by: ["direction"],
      where,
      _sum: { amountUsd: true },
    }),
    // Money the business took that never entered an account, so it is on the
    // Payments page and deliberately NOT here. Stating it is what stops the
    // two registers looking like one of them is wrong.
    prisma.payment.aggregate({
      where: { accountId: null },
      _sum: { creditedAmount: true },
      _count: true,
    }),
    currentRate(),
  ]);

  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const unbankedUsd = toNumber(unbanked._sum.creditedAmount);

  const inUsd = toNumber(
    totals.find((t) => t.direction === "IN")?._sum.amountUsd ?? 0
  );
  const outUsd = toNumber(
    totals.find((t) => t.direction === "OUT")?._sum.amountUsd ?? 0
  );
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filtered = Boolean(params.account || params.direction || params.kind);
  const linkWith = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams();
    const merged = {
      account: params.account,
      direction: params.direction,
      kind: params.kind,
      ...patch,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value) next.set(key, value);
    }
    const qs = next.toString();
    return qs ? `/app/finance/transactions?${qs}` : "/app/finance/transactions";
  };

  return (
    <>
      <PageHeader
        title="Money in &amp; out"
        description="Every time money entered or left one of the company's own accounts — customer payments, costs, transfers between accounts. Written by the action that moved it, never typed."
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyTile
          label="Money in"
          usd={inUsd}
          rate={rate}
          icon={ArrowDownLeft}
          tone="good"
        />
        <MoneyTile
          label="Money out"
          usd={outUsd}
          rate={rate}
          icon={ArrowUpRight}
          tone={outUsd > 0 ? "warn" : "default"}
        />
        <MoneyTile
          label="Net"
          usd={inUsd - outUsd}
          rate={rate}
          icon={Scale}
          tone={inUsd - outUsd >= 0 ? "default" : "bad"}
          count={`${total} movement${total === 1 ? "" : "s"}`}
          hint={filtered ? "matching these filters" : undefined}
        />
        {/* Not a movement, and that is the point: it is the money that has NOT
            reached an account, which is exactly why this page and Payments
            show different totals. */}
        <MoneyTile
          label="Taken, not in an account"
          usd={unbankedUsd}
          rate={rate}
          icon={CircleHelp}
          tone={unbanked._count > 0 ? "warn" : "good"}
          count={
            unbanked._count > 0
              ? `${unbanked._count} payment${unbanked._count === 1 ? "" : "s"}`
              : undefined
          }
          hint={
            unbanked._count > 0
              ? "On Payments, with no account named — so it has no line here"
              : "Every payment reached an account"
          }
          href="/app/finance/payments"
        />
      </div>

      {/* Filters as links, not a form: every view here is a URL somebody can
          send to somebody else. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Account
        </span>
        <FilterChip href={linkWith({ account: undefined })} active={!params.account}>
          All
        </FilterChip>
        {accounts.map((account) => (
          <FilterChip
            key={account.id}
            href={linkWith({ account: account.id })}
            active={params.account === account.id}
          >
            {account.name}
          </FilterChip>
        ))}
        <span className="mx-2 hidden h-4 w-px bg-border sm:block" />
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          Direction
        </span>
        <FilterChip
          href={linkWith({ direction: undefined })}
          active={!params.direction}
        >
          Both
        </FilterChip>
        <FilterChip href={linkWith({ direction: "IN" })} active={params.direction === "IN"}>
          In
        </FilterChip>
        <FilterChip
          href={linkWith({ direction: "OUT" })}
          active={params.direction === "OUT"}
        >
          Out
        </FilterChip>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title={filtered ? "Nothing matches that" : "No movements yet"}
          description={
            filtered
              ? "No money has moved through that account, or in that direction, yet."
              : "Every payment, expense and transfer writes a line here as it happens."
          }
        />
      ) : (
        <div className="rounded-xl border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Entry</TableHead>
                <TableHead>When</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="hidden md:table-cell">Account</TableHead>
                <TableHead className="hidden lg:table-cell">Type</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const tracking =
                  entry.payment?.invoice.shipment.trackingNumber ?? null;
                const inbound = entry.direction === "IN";
                return (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs tabular text-muted-foreground">
                      {entry.entryNumber}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateTime(entry.occurredAt)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {/* Straight back to the document behind the money. A
                          register line nobody can open is a claim, not a record. */}
                      {tracking ? (
                        <Link
                          href={`/app/cargo/${tracking}`}
                          className="hover:text-brand"
                        >
                          {entry.description}
                        </Link>
                      ) : (
                        entry.description
                      )}
                      {entry.recordedBy ? (
                        <span className="block text-xs text-muted-foreground">
                          {entry.recordedBy.name}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      {entry.account.name}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Badge variant="outline" className="font-normal">
                        {KIND_LABEL[entry.kind] ?? entry.kind}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular">
                      <span className={inbound ? "text-success" : ""}>
                        {inbound ? "+" : "−"}
                        {formatMoney(entry.amount, entry.currency)}
                      </span>
                      {entry.currency === "USD" ? null : (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {formatUsd(toNumber(entry.amountUsd))}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {page} of {pages}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={linkWith({ page: String(page - 1) })}
                className="focus-ring rounded-lg border px-3 py-1.5 hover:bg-accent"
              >
                Previous
              </Link>
            ) : null}
            {page < pages ? (
              <Link
                href={linkWith({ page: String(page + 1) })}
                className="focus-ring rounded-lg border px-3 py-1.5 hover:bg-accent"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function FilterChip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
