import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";

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
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Transactions" };

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

  const [accounts, entries, total, totals] = await Promise.all([
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
  ]);

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
        title="Transactions"
        description="Every movement of money, in and out, newest first. Each line was written by the action that moved it — nothing here is entered by hand."
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      <dl className="mb-6 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
        <div className="bg-card p-4">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowDownLeft className="h-3.5 w-3.5 text-success" />
            In
          </dt>
          <dd className="mt-1 font-display text-lg font-bold tabular-nums text-success">
            {formatUsd(inUsd)}
          </dd>
        </div>
        <div className="bg-card p-4">
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ArrowUpRight className="h-3.5 w-3.5 text-destructive" />
            Out
          </dt>
          <dd className="mt-1 font-display text-lg font-bold tabular-nums">
            {outUsd === 0 ? "—" : formatUsd(outUsd)}
          </dd>
        </div>
        <div className="bg-card p-4">
          <dt className="text-xs text-muted-foreground">Net</dt>
          <dd className="mt-1 font-display text-lg font-bold tabular-nums">
            {formatUsd(inUsd - outUsd)}
          </dd>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {filtered ? `across ${total} matching` : `across ${total}`} movement
            {total === 1 ? "" : "s"}
          </p>
        </div>
      </dl>

      {/* Filters as links, not a form: every view here is a URL somebody can
          send to somebody else. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
        <FilterChip href={linkWith({ account: undefined })} active={!params.account}>
          All accounts
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
        <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
        <FilterChip
          href={linkWith({ direction: undefined })}
          active={!params.direction}
        >
          In &amp; out
        </FilterChip>
        <FilterChip href={linkWith({ direction: "IN" })} active={params.direction === "IN"}>
          In only
        </FilterChip>
        <FilterChip
          href={linkWith({ direction: "OUT" })}
          active={params.direction === "OUT"}
        >
          Out only
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
