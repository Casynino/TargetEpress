import Link from "next/link";
import type { Metadata } from "next";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { AttributePayment } from "@/components/app/attribute-payment";
import { MoneyTile } from "@/components/app/money-tile";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Banknote, CircleHelp, HandCoins, Wallet } from "lucide-react";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import { activeAccounts } from "@/lib/accounts";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { FinanceNav } from "@/components/app/finance-nav";
import { financeTabs } from "@/lib/finance-tabs";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Payments from customers") };
}

export default async function PaymentsPage() {
  const user = await requirePermission("payment.record");
  const locale = await viewerLocale();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    payments,
    monthAgg,
    allTime,
    byMethod,
    unattributed,
    byTendered,
    rateRow,
    accounts,
  ] = await Promise.all([
    prisma.payment.findMany({
      orderBy: { paidAt: "desc" },
      take: 100,
      include: {
        receipt: true,
        receivedBy: { select: { name: true } },
        account: { select: { name: true, code: true } },
        invoice: {
          select: {
            invoiceNumber: true,
            currency: true,
            shipment: { select: { trackingNumber: true } },
            customer: { select: { name: true } },
          },
        },
      },
    }),
    // Both totals sum `creditedAmount`, not `amount`. A customer hands over
    // shillings or dollars as they please; `amount` is whatever was handed
    // over, so adding it up produces a figure in no currency at all.
    // `creditedAmount` is that same money restated in the invoice's currency
    // at the rate frozen onto the invoice — the only version that adds up.
    prisma.payment.aggregate({
      where: { paidAt: { gte: monthStart } },
      _sum: { creditedAmount: true },
      _count: true,
    }),
    prisma.payment.aggregate({ _sum: { creditedAmount: true }, _count: true }),
    prisma.payment.groupBy({
      by: ["method"],
      _sum: { creditedAmount: true },
      _count: true,
    }),
    // Money in hand that nobody has said where it went — a job, not a statistic.
    prisma.payment.aggregate({
      where: { accountId: null },
      _sum: { creditedAmount: true },
      _count: true,
    }),
    // How customers actually tendered — shillings or dollars. Distinct from
    // every other figure here, which is the money restated in the invoice's
    // currency, and the one that says whether this is a shilling business.
    prisma.payment.groupBy({
      by: ["currency"],
      _sum: { creditedAmount: true },
      _count: true,
    }),
    currentRate(),
    activeAccounts(),
  ]);

  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const methodTotal = byMethod.reduce((n, r) => n + r._count, 0);
  const inShillings = byTendered.find((r) => r.currency === "TZS");
  const tenderedTotal = byTendered.reduce((n, r) => n + r._count, 0);

  return (
    <>
      <PageHeader
        title="Payments from customers"
        description="Money in from customers only, with the receipt issued for it. Costs, transfers and anything leaving an account are on Money in & out."
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MoneyTile
          label="Collected this month"
          usd={toNumber(monthAgg._sum.creditedAmount)}
          rate={rate}
          icon={Banknote}
          tone="good"
          count={`${monthAgg._count} ${t(locale, monthAgg._count === 1 ? "payment" : "payments")}`}
        />
        <MoneyTile
          label="Collected all time"
          usd={toNumber(allTime._sum.creditedAmount)}
          rate={rate}
          icon={HandCoins}
          count={`${allTime._count} ${t(locale, allTime._count === 1 ? "payment" : "payments")}`}
        />
        <MoneyTile
          label="No account named"
          usd={toNumber(unattributed._sum.creditedAmount)}
          rate={rate}
          icon={CircleHelp}
          tone={unattributed._count > 0 ? "warn" : "good"}
          count={
            unattributed._count > 0
              ? `${unattributed._count} ${t(locale, unattributed._count === 1 ? "payment" : "payments")}`
              : undefined
          }
          hint={
            unattributed._count > 0
              ? "Open the payment and say where it landed"
              : "Every payment says where it landed"
          }
        />
        {/* Never a copy of a total above it: this is the share of money
            handed over in shillings, which is the thing worth knowing here. */}
        <MoneyTile
          label="Handed over in shillings"
          usd={toNumber(inShillings?._sum.creditedAmount ?? 0)}
          rate={rate}
          icon={Wallet}
          tone="brand"
          count={
            tenderedTotal > 0
              ? `${inShillings?._count ?? 0} ${t(locale, "of")} ${tenderedTotal} ${t(locale, tenderedTotal === 1 ? "payment" : "payments")}`
              : undefined
          }
          hint={
            byMethod[0]
              ? `${t(locale, "Mostly by")} ${t(locale, PAYMENT_METHOD_LABELS[byMethod[0].method]).toLowerCase()}`
              : "The rest came in dollars"
          }
        />
      </div>

      {/* The rest of the split, one line rather than a card each — with three
          methods in use a card apiece left a ragged half-empty row. */}
      {byMethod.length > 1 ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {t(locale, "Also paid by")}
          </span>
          {byMethod.slice(1).map((row) => (
            <span
              key={row.method}
              className="rounded-full border bg-card px-2.5 py-1 font-medium"
            >
              {t(locale, PAYMENT_METHOD_LABELS[row.method])}
              <span className="ml-1.5 font-mono text-muted-foreground">
                {formatMoney(
                  rate ? toNumber(row._sum.creditedAmount) * rate : toNumber(row._sum.creditedAmount),
                  rate ? "TZS" : "USD"
                )}
              </span>
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-6">
        {payments.length === 0 ? (
          <EmptyState
            title={t(locale, "No payments yet")}
            description={t(
              locale,
              "Payments are recorded from a shipment's page once an invoice exists."
            )}
          />
        ) : (
          <>
          {/*
            A phone gets cards, not a table with most of it switched off.

            The table hides Customer, Method, Landed in, Received by and When
            below various breakpoints, so on a phone a finance clerk saw a
            receipt number, a tracking number and an amount — not who paid,
            how, into which account, or when. Those are the questions this page
            exists to answer, and hiding them is worse than scrolling for them.
          */}
          <ul className="space-y-3 md:hidden">
            {payments.map((payment) => (
              <li key={payment.id} className="panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`/app/cargo/${payment.invoice.shipment.trackingNumber}`}
                      className="block font-mono text-sm font-semibold tabular hover:text-brand"
                    >
                      {payment.invoice.shipment.trackingNumber}
                    </Link>
                    <p className="mt-0.5 truncate text-sm">
                      {payment.invoice.customer.name}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-base font-semibold tabular">
                      {formatMoney(payment.amount, payment.currency)}
                    </p>
                    {payment.creditedAmount !== null &&
                    payment.currency !== payment.invoice.currency ? (
                      <p className="text-[11px] text-muted-foreground">
                        {t(locale, "settled")}{" "}
                        {formatUsd(toNumber(payment.creditedAmount))}
                      </p>
                    ) : null}
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-3 text-xs">
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t(locale, "Method")}
                    </dt>
                    <dd className="mt-0.5">
                      {t(locale, PAYMENT_METHOD_LABELS[payment.method])}
                      {payment.reference ? (
                        <span className="block text-[11px] text-muted-foreground">
                          {payment.reference}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t(locale, "Received by")}
                    </dt>
                    <dd className="mt-0.5">{payment.receivedBy?.name ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t(locale, "When")}
                    </dt>
                    <dd className="mt-0.5 text-muted-foreground">
                      {formatDateTime(payment.paidAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {t(locale, "Receipt")}
                    </dt>
                    <dd className="mt-0.5">
                      <Link
                        href={`/app/finance/payments/${payment.id}`}
                        className="font-mono tabular hover:text-brand"
                      >
                        {payment.receipt?.receiptNumber ?? t(locale, "Open")}
                      </Link>
                    </dd>
                  </div>
                </dl>

                {/* Attribution is an action, not a field — it gets the width. */}
                <div className="mt-3 border-t pt-3">
                  <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {t(locale, "Landed in")}
                  </p>
                  <div className="mt-1">
                    {payment.account ? (
                      <span className="text-sm">{payment.account.name}</span>
                    ) : (
                      <AttributePayment
                        paymentId={payment.id}
                        currency={payment.currency}
                        accounts={accounts}
                      />
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden rounded-xl border bg-card shadow-soft md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t(locale, "Receipt")}</TableHead>
                  <TableHead>{t(locale, "Shipment")}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t(locale, "Customer")}
                  </TableHead>
                  <TableHead className="text-right">
                    {t(locale, "Amount")}
                  </TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t(locale, "Method")}
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t(locale, "Landed in")}
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t(locale, "Received by")}
                  </TableHead>
                  <TableHead className="hidden lg:table-cell">
                    {t(locale, "When")}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-mono text-xs tabular">
                      <Link
                        href={`/app/finance/payments/${payment.id}`}
                        className="hover:text-brand"
                      >
                        {payment.receipt?.receiptNumber ?? t(locale, "Open")}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Link
                        href={`/app/cargo/${payment.invoice.shipment.trackingNumber}`}
                        className="font-mono text-sm tabular hover:text-brand"
                      >
                        {payment.invoice.shipment.trackingNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm">
                      {payment.invoice.customer.name}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-medium tabular">
                      {/* What was handed over at the counter — the receipt
                          says this. When that was not the invoice's own
                          currency, what it actually settled is the figure the
                          bill moved by, so both are shown. */}
                      {formatMoney(payment.amount, payment.currency)}
                      {payment.creditedAmount !== null &&
                      payment.currency !== payment.invoice.currency ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {t(locale, "settled")}{" "}
                          {formatUsd(toNumber(payment.creditedAmount))}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-sm">
                      {t(locale, PAYMENT_METHOD_LABELS[payment.method])}
                      {payment.reference ? (
                        <span className="block text-xs text-muted-foreground">
                          {payment.reference}
                        </span>
                      ) : null}
                    </TableCell>
                    {/* Which of our accounts took it. Blank is a real answer,
                        not a missing one — see the Accounts view, where it
                        adds up under Unattributed rather than disappearing. */}
                    <TableCell className="hidden md:table-cell text-sm">
                      {payment.account ? (
                        payment.account.name
                      ) : (
                        <AttributePayment
                          paymentId={payment.id}
                          currency={payment.currency}
                          accounts={accounts}
                        />
                      )}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {payment.receivedBy?.name ?? "—"}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                      {formatDateTime(payment.paidAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </>
        )}
      </div>
    </>
  );
}
