import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Building2,
  Paperclip,
  Smartphone,
  Wallet,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Account" };

const KIND_ICON = {
  BANK: Building2,
  MOBILE_MONEY: Smartphone,
  CASH: Wallet,
} as const;

const KIND_LABEL = {
  BANK: "Bank",
  MOBILE_MONEY: "Mobile money",
  CASH: "Cash",
} as const;

const ENTRY_LABEL: Record<string, string> = {
  OPENING_BALANCE: "Opening balance",
  CUSTOMER_PAYMENT: "Customer payment",
  EXPENSE: "Expense",
  COMPENSATION: "Compensation",
  TRANSFER_IN: "Transfer in",
  TRANSFER_OUT: "Transfer out",
  ADJUSTMENT: "Adjustment",
};

/**
 * One account, and everything that has ever moved through it.
 *
 * The account cards on the previous screen answer "how much"; this answers
 * "from what". Every line names the document behind it and links to it, so a
 * balance can be walked back to the receipt or the expense that made it —
 * which is the whole difference between a figure and an audited figure.
 *
 * The register is a mixture of money in and money out on purpose. A bank
 * statement is not two lists, and reconciling against one means reading the
 * same shape.
 */
export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("account.view");
  const locale = await viewerLocale();
  const { id } = await params;

  const account = await prisma.companyAccount.findUnique({ where: { id } });
  if (!account) notFound();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [entries, totals, monthTotals] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where: { accountId: account.id },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: 200,
      include: {
        recordedBy: { select: { name: true } },
        payment: {
          select: {
            reference: true,
            method: true,
            receipt: { select: { receiptNumber: true } },
            proofs: { select: { url: true }, take: 1 },
            invoice: {
              select: {
                invoiceNumber: true,
                customer: { select: { name: true } },
                shipment: { select: { trackingNumber: true } },
              },
            },
          },
        },
        expense: {
          select: {
            expenseNumber: true,
            vendor: true,
            category: true,
            receipts: { select: { url: true }, take: 1 },
          },
        },
        transfer: {
          select: {
            transferNumber: true,
            fromAccount: { select: { name: true } },
            toAccount: { select: { name: true } },
          },
        },
      },
    }),
    prisma.ledgerEntry.groupBy({
      by: ["direction"],
      where: { accountId: account.id },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.ledgerEntry.groupBy({
      by: ["direction"],
      where: { accountId: account.id, occurredAt: { gte: monthStart } },
      _sum: { amount: true },
    }),
  ]);

  const sum = (
    rows: { direction: string; _sum: { amount: unknown } }[],
    dir: "IN" | "OUT"
  ) => toNumber((rows.find((r) => r.direction === dir)?._sum.amount ?? 0) as never);

  const inflow = sum(totals, "IN");
  const outflow = sum(totals, "OUT");
  const balance = inflow - outflow;
  const netMonth = sum(monthTotals, "IN") - sum(monthTotals, "OUT");
  const movements = totals.reduce((n, r) => n + r._count, 0);

  const Icon = KIND_ICON[account.kind];
  const money = (n: number) => formatMoney(n, account.currency);

  return (
    <>
      <Link
        href="/app/finance/accounts"
        className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t(locale, "All accounts")}
      </Link>

      {/* The account itself, stated once and unmistakably. Somebody
          reconciling has a bank statement open beside this screen, so the
          number on the statement — the account number — is on it. */}
      <section className="relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br from-brand via-brand to-signal p-6 text-brand-foreground shadow-lift">
        <div
          aria-hidden
          className="grid-backdrop pointer-events-none absolute inset-0 opacity-20"
        />
        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-medium backdrop-blur">
              <Icon className="h-3.5 w-3.5" />
              {t(locale, KIND_LABEL[account.kind])}
            </span>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">
              {account.name}
            </h1>
            {account.accountName ? (
              <p className="mt-1 text-sm text-brand-foreground/80">
                {account.accountName}
              </p>
            ) : null}
            {account.accountNumber ? (
              <p className="mt-1 font-mono text-sm tracking-wide text-brand-foreground/70">
                {t(locale, "A/C")} {account.accountNumber}
              </p>
            ) : null}
          </div>

          <div className="text-right">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-foreground/70">
              {t(locale, "Balance")}
            </p>
            <p className="mt-1 font-display text-4xl font-bold tabular-nums">
              {money(balance)}
            </p>
            <p className="mt-1 text-xs text-brand-foreground/70">
              {t(locale, "in")} {money(inflow)} · {t(locale, "out")}{" "}
              {money(outflow)}
            </p>
          </div>
        </div>
      </section>

      {/* Said again, because the banner above is not a balance until an
          opening figure exists and pretending otherwise is the one thing this
          section must not do. */}
      {account.openingSetAt === null ? (
        <p className="mb-6 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {t(locale, "This is what has moved through the account here")}
          </span>{" "}
          {t(
            locale,
            "— no opening balance has been set, so whatever was already in it is not counted."
          )}
        </p>
      ) : null}

      <dl className="mb-6 grid grid-cols-1 gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
        <div className="bg-card p-4">
          <dt className="text-sm text-muted-foreground">{t(locale, "Balance")}</dt>
          <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
            {money(balance)}
          </dd>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {movements}{" "}
            {movements === 1 ? t(locale, "movement") : t(locale, "movements")}
          </p>
        </div>
        <div className="bg-card p-4">
          <dt className="text-sm text-muted-foreground">
            {t(locale, "Received (all time)")}
          </dt>
          <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-success">
            {money(inflow)}
          </dd>
        </div>
        <div className="bg-card p-4">
          <dt className="text-sm text-muted-foreground">
            {t(locale, "Paid out (all time)")}
          </dt>
          <dd className="mt-1 font-display text-2xl font-bold tabular-nums">
            {outflow === 0 ? money(0) : money(outflow)}
          </dd>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t(locale, "net this month")} {money(netMonth)}
          </p>
        </div>
      </dl>

      {entries.length === 0 ? (
        <EmptyState
          title={t(locale, "Nothing has moved through this account yet")}
          description={t(
            locale,
            "Payments attributed to it, costs paid from it and transfers in or out all appear here as they happen."
          )}
        />
      ) : (
        <>
        {/*
          One account's register, on a phone.

          Recorded by, Reference, Related and Proof were all switched off below
          various breakpoints, so a phone showed the date, a badge, a name and
          an amount — not which receipt it was, what it related to, or whether
          there is proof attached. On an account page, "where did this money
          come from and can I evidence it" is the whole question.

          Same shape as the general ledger: what it was on the left, the
          movement on the right with its sign, and the supporting codes and
          proof underneath.
        */}
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-soft md:hidden">
          {entries.map((entry) => {
            const inbound = entry.direction === "IN";
            const detail =
              entry.payment?.invoice.customer.name ??
              entry.expense?.vendor ??
              entry.description;
            const related =
              entry.payment?.receipt?.receiptNumber ??
              entry.expense?.expenseNumber ??
              entry.transfer?.transferNumber ??
              null;
            const tracking = entry.payment?.invoice.shipment.trackingNumber ?? null;
            const proof =
              entry.payment?.proofs[0]?.url ??
              entry.expense?.receipts[0]?.url ??
              null;

            return (
              <li key={entry.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{detail}</p>
                    <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">
                      {entry.description}
                    </p>
                  </div>
                  <p
                    className={
                      inbound
                        ? "shrink-0 font-mono text-sm font-semibold tabular text-success"
                        : "shrink-0 font-mono text-sm font-semibold tabular text-warning"
                    }
                  >
                    {inbound ? "+" : "−"}
                    {money(toNumber(entry.amount))}
                  </p>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
                  <Badge
                    variant="outline"
                    className={`whitespace-nowrap px-1.5 py-0 text-[10px] font-normal ${
                      inbound
                        ? "border-success/40 text-success"
                        : "border-warning/40 text-warning"
                    }`}
                  >
                    {t(locale, ENTRY_LABEL[entry.kind] ?? entry.kind)}
                  </Badge>
                  <span>{formatDateTime(entry.occurredAt, locale)}</span>
                  {related ? (
                    <span className="whitespace-nowrap font-mono text-muted-foreground/70">
                      {related}
                    </span>
                  ) : null}
                  {tracking ? (
                    <Link
                      href={`/app/cargo/${tracking}`}
                      className="whitespace-nowrap font-mono text-brand hover:underline"
                    >
                      {tracking}
                    </Link>
                  ) : null}
                  {proof ? (
                    <a
                      href={proof}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                    >
                      <Paperclip className="h-3 w-3" />
                      {t(locale, "Proof")}
                    </a>
                  ) : null}
                  <span className="text-muted-foreground/70">
                    {entry.recordedBy?.name ?? "—"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="hidden overflow-hidden rounded-xl border bg-card shadow-soft md:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "Date")}</TableHead>
                <TableHead>{t(locale, "Type")}</TableHead>
                <TableHead>{t(locale, "Detail")}</TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t(locale, "Recorded by")}
                </TableHead>
                <TableHead className="text-right">{t(locale, "Amount")}</TableHead>
                <TableHead className="hidden xl:table-cell">
                  {t(locale, "Reference")}
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  {t(locale, "Related")}
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  {t(locale, "Proof")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const inbound = entry.direction === "IN";
                const tracking =
                  entry.payment?.invoice.shipment.trackingNumber ?? null;
                const proof =
                  entry.payment?.proofs[0]?.url ??
                  entry.expense?.receipts[0]?.url ??
                  null;
                const detail =
                  entry.payment?.invoice.customer.name ??
                  entry.expense?.vendor ??
                  entry.description;
                const related =
                  entry.payment?.receipt?.receiptNumber ??
                  entry.expense?.expenseNumber ??
                  entry.transfer?.transferNumber ??
                  null;

                return (
                  <TableRow key={entry.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {formatDateTime(entry.occurredAt, locale)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`whitespace-nowrap font-normal ${
                          inbound
                            ? "border-success/40 text-success"
                            : "border-warning/40 text-warning"
                        }`}
                      >
                        {t(locale, ENTRY_LABEL[entry.kind] ?? entry.kind)}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[22rem] text-sm">
                      <span className="block truncate font-medium">{detail}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {entry.description}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {entry.recordedBy?.name ?? "—"}
                    </TableCell>
                    {/* Signed, and coloured only for money coming in. Red on
                        every outgoing line makes normal spending look like a
                        problem. */}
                    <TableCell
                      className={`whitespace-nowrap text-right font-mono text-sm font-medium tabular ${
                        inbound ? "text-success" : ""
                      }`}
                    >
                      {inbound ? "+" : "−"}
                      {money(toNumber(entry.amount))}
                      {account.currency === "USD" ? null : (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {formatUsd(toNumber(entry.amountUsd))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden xl:table-cell font-mono text-xs text-muted-foreground">
                      {entry.payment?.reference ?? "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-xs">
                      {tracking ? (
                        <Link
                          href={`/app/cargo/${tracking}`}
                          className="font-mono hover:text-brand"
                        >
                          {tracking}
                        </Link>
                      ) : related ? (
                        <span className="font-mono text-muted-foreground">
                          {related}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">
                      {proof ? (
                        <a
                          href={proof}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                        >
                          <Paperclip className="h-3 w-3" />
                          {t(locale, "View")}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
        </>
      )}
    </>
  );
}
