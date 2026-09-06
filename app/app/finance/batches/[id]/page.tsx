import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Plane } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SectionLabel } from "@/components/app/section-label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { BATCH_STATUS_META, ORIGIN_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses";
import { financeDashboard } from "@/lib/finance-dashboard";
import { formatDate, toNumber } from "@/lib/format";
import { currentRate } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { outstandingOf } from "@/lib/invoice-balance";
import { formatLocal, formatShillings, formatUsd } from "@/lib/money";
import { prisma } from "@/lib/prisma";
import { windowFor } from "@/lib/profit";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Flight ledger") };
}

/**
 * ONE FLIGHT'S BOOK, OPEN.
 *
 * The batch list answers "which flights made money". It cannot answer the
 * question that follows — "why does this one say that" — and the owner asked
 * for the page that does: every movement of money attached to one aircraft, in
 * one place, with the totals it adds up to.
 *
 * THE TOTALS ARE NOT COMPUTED HERE. They are financeDashboard's own figures for
 * this batch, the same engine the owner's dashboard and the manager's list
 * read. A page with its own arithmetic eventually disagrees with the figures it
 * exists to explain, and then every conversation starts with an argument about
 * the page.
 *
 * WHAT IS COMPUTED HERE is only the list underneath: the payments, the costs
 * and the bills still open, fetched by the flight they belong to. Those are
 * records, not derivations — nothing is added up twice.
 *
 * Shillings lead and dollars sit beside them, the house rule. Each flight's
 * own totals are summed as shillings by the engine rather than converted from
 * the dollar snapshot: a cost of TSh 20,000 is stored as USD 7.41, and
 * 7.41 × 2,700 is 20,007.
 */
export default async function BatchLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("profit.view");
  const { id } = await params;
  const locale = await viewerLocale();

  const batch = await prisma.batch.findUnique({
    where: { id },
    select: {
      id: true,
      batchNumber: true,
      origin: true,
      status: true,
      departedAt: true,
      arrivedAt: true,
      flightNumber: true,
      _count: { select: { shipments: { where: { deletedAt: null } } } },
    },
  });
  if (!batch) notFound();

  const picked = windowFor("all");
  const [dash, rateRow, payments, expenses, invoices] = await Promise.all([
    /* The same engine, narrowed to this aircraft. */
    financeDashboard(picked.window, picked.previous, { batchId: id }),
    currentRate(),
    prisma.payment.findMany({
      where: {
        voidedAt: null,
        OR: [
          { invoice: { shipment: { batchId: id } } },
          { allocations: { some: { invoice: { shipment: { batchId: id } } } } },
        ],
      },
      orderBy: { paidAt: "desc" },
      select: {
        id: true,
        amount: true,
        currency: true,
        creditedAmount: true,
        transportAmount: true,
        method: true,
        reference: true,
        paidAt: true,
        account: { select: { name: true } },
        receipt: { select: { receiptNumber: true } },
        customer: { select: { name: true } },
        invoice: {
          select: {
            invoiceNumber: true,
            shipment: { select: { trackingNumber: true } },
          },
        },
        receivedBy: { select: { name: true } },
      },
    }),
    prisma.expense.findMany({
      where: { batchId: id, status: { not: "VOID" } },
      orderBy: { incurredAt: "desc" },
      select: {
        id: true,
        category: true,
        description: true,
        amount: true,
        currency: true,
        amountUsd: true,
        incurredAt: true,
        recordedBy: { select: { name: true } },
      },
    }),
    prisma.invoice.findMany({
      where: {
        shipment: { batchId: id },
        status: { in: ["UNPAID", "PARTIALLY_PAID"] },
      },
      orderBy: { issuedAt: "asc" },
      select: {
        id: true,
        invoiceNumber: true,
        total: true,
        amountPaid: true,
        amountAdjusted: true,
        currency: true,
        exchangeRate: true,
        customer: { select: { name: true } },
        shipment: { select: { trackingNumber: true } },
      },
    }),
  ]);

  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const row = dash.batches.find((b) => b.id === id) ?? null;
  const meta = BATCH_STATUS_META[batch.status];

  /* Shillings from the engine's own shilling totals; dollars beside them. */
  const pair = (local: number, usd: number) => ({
    lead: rate === null ? formatUsd(usd) : formatLocal(local),
    beside: rate === null ? null : formatUsd(usd),
  });

  const TOTALS = row
    ? [
        { label: "Revenue", ...pair(row.expectedLocal, row.expectedUsd), tone: "" },
        { label: "Collected", ...pair(row.collectedLocal, row.collectedUsd), tone: "text-success" },
        { label: "Outstanding", ...pair(row.outstandingLocal, row.outstandingUsd), tone: "text-warning" },
        { label: "Costs", ...pair(row.expensesLocal, row.expensesUsd), tone: "text-destructive" },
        { label: "Profit / loss", ...pair(row.profitLocal, row.profitUsd), tone: row.profitUsd >= 0 ? "text-success" : "text-destructive" },
      ]
    : [];

  return (
    <>
      <div className="mb-4">
        <Link
          href="/app/finance/batches"
          className="focus-ring inline-flex items-center gap-1.5 rounded text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t(locale, "Every flight")}
        </Link>
      </div>

      <PageHeader
        title={`${batch.batchNumber}`}
        description={`${t(locale, ORIGIN_LABELS[batch.origin] ?? batch.origin)} · ${batch._count.shipments} ${t(locale, "consignments")}${
          batch.flightNumber ? ` · ${batch.flightNumber}` : ""
        }${batch.departedAt ? ` · ${t(locale, "left")} ${formatDate(batch.departedAt, locale)}` : ""}`}
        actions={<Badge variant={meta?.tone ?? "muted"}>{t(locale, meta?.label ?? batch.status)}</Badge>}
      />

      {/* The figures this flight adds up to, before any of the lines that made
          them. Somebody opening this page has a number in their head already —
          it should be the first thing they can check. */}
      {row ? (
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {TOTALS.map((card) => (
            <div key={card.label} className="rounded-xl border bg-card p-4 shadow-soft">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t(locale, card.label)}
              </p>
              {/* Shilling totals on this business run to tens of millions and
                  a flight's lifetime figure can pass a billion. At one fixed
                  size the number broke after the "TSh" and the card lost its
                  shape, so the type gives way to the figure rather than the
                  other way round. */}
              <p
                className={`mt-1 whitespace-nowrap font-display font-bold tabular-nums ${
                  card.lead.length > 15
                    ? "text-base"
                    : card.lead.length > 12
                      ? "text-lg"
                      : "text-xl"
                } ${card.tone}`}
              >
                {card.lead}
              </p>
              {card.beside ? (
                <p className="font-mono text-[11px] text-muted-foreground">{card.beside}</p>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <SectionLabel>{t(locale, "Money in")}</SectionLabel>
      {payments.length === 0 ? (
        <EmptyState
          title={t(locale, "Nothing collected on this flight yet")}
          description={t(locale, "Payments appear here the moment they are recorded against any consignment on it.")}
        />
      ) : (
        <div className="mb-6 overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "When")}</TableHead>
                <TableHead>{t(locale, "Customer")}</TableHead>
                <TableHead>{t(locale, "Cargo")}</TableHead>
                <TableHead>{t(locale, "How")}</TableHead>
                <TableHead>{t(locale, "Landed in")}</TableHead>
                <TableHead className="text-right">{t(locale, "Amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const transport = toNumber(p.transportAmount);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(p.paidAt, locale)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.customer?.name ?? p.invoice?.shipment?.trackingNumber ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {p.invoice?.shipment?.trackingNumber ?? p.invoice?.invoiceNumber ?? t(locale, "Several")}
                    </TableCell>
                    <TableCell className="text-xs">
                      {t(locale, PAYMENT_METHOD_LABELS[p.method] ?? p.method)}
                      {p.reference ? (
                        <span className="block font-mono text-[11px] text-muted-foreground">
                          {p.reference}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.account?.name ?? "—"}
                      {p.receipt ? (
                        <span className="block font-mono text-[11px]">{p.receipt.receiptNumber}</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold tabular-nums">
                        {formatLocal(toNumber(p.amount), p.currency)}
                      </span>
                      {/* Said where it is, because a transfer that carried a
                          fare is larger than the bill it settled and otherwise
                          reads as an overpayment nobody can account for. */}
                      {transport > 0.005 ? (
                        <span className="block text-[11px] text-muted-foreground">
                          {t(locale, "includes")} {formatLocal(transport, p.currency)} {t(locale, "transport")}
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <SectionLabel>{t(locale, "Money out")}</SectionLabel>
      {expenses.length === 0 ? (
        <EmptyState
          title={t(locale, "No costs booked to this flight")}
          description={t(locale, "Freight, handling and clearing appear here once Finance records them against it.")}
        />
      ) : (
        <div className="mb-6 overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "When")}</TableHead>
                <TableHead>{t(locale, "What")}</TableHead>
                <TableHead>{t(locale, "Recorded by")}</TableHead>
                <TableHead className="text-right">{t(locale, "Amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDate(e.incurredAt, locale)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {t(locale, EXPENSE_CATEGORY_LABELS[e.category] ?? e.category)}
                    {e.description ? (
                      <span className="block text-[11px] text-muted-foreground">
                        {e.description}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {e.recordedBy?.name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-destructive">
                    {formatLocal(toNumber(e.amount), e.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <SectionLabel>{t(locale, "Still owed on this flight")}</SectionLabel>
      {invoices.length === 0 ? (
        <EmptyState
          title={t(locale, "Every bill on this flight is settled")}
          description={t(locale, "Nothing on it is waiting for a customer to pay.")}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t(locale, "Cargo")}</TableHead>
                <TableHead>{t(locale, "Customer")}</TableHead>
                <TableHead>{t(locale, "Bill")}</TableHead>
                <TableHead className="text-right">{t(locale, "Outstanding")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((inv) => {
                const owed = outstandingOf(inv);
                const owedRate = inv.exchangeRate ? toNumber(inv.exchangeRate) : null;
                return (
                  <TableRow key={inv.id}>
                    <TableCell className="font-mono text-xs">
                      <Link
                        href={`/app/cargo/${inv.shipment?.trackingNumber ?? ""}`}
                        className="focus-ring rounded hover:text-brand"
                      >
                        {inv.shipment?.trackingNumber ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{inv.customer?.name ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {inv.invoiceNumber}
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="font-semibold tabular-nums text-warning">
                        {/* At the rate frozen onto the bill, never today's —
                            that is the figure the customer was quoted. */}
                        {owedRate ? formatLocal(owed * owedRate) : formatUsd(owed)}
                      </span>
                      {owedRate ? (
                        <span className="block font-mono text-[11px] text-muted-foreground">
                          {formatUsd(owed)}
                        </span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
