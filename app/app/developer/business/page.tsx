import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { ReceiptText } from "lucide-react";

import { InfoCallout } from "@/components/developer/info";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { eat, formatNumber, humanize } from "@/lib/developer/format";
import { formatMoney, formatWeight } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Business" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "cargo", label: "Cargo" },
  { key: "bills", label: "Bills" },
  { key: "payments", label: "Payments" },
  { key: "customers", label: "Customers" },
] as const;
type Tab = (typeof TABS)[number]["key"];

const TAKE = 30;

/**
 * THE BUSINESS IN READ-ONLY TABLES.
 *
 * For checking a number without a button anywhere near it. The newest rows,
 * searchable; nothing here writes. Money is shown as it is stored — a payment's
 * credited figure falls back to what was handed over, never to zero — and the
 * outstanding amount is derived (total − paid) at read time, as everywhere.
 */
export default async function DeveloperBusinessPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>;
}) {
  await requirePermission("developer.access");
  const sp = await searchParams;
  const tab: Tab = TABS.some((x) => x.key === sp.tab) ? (sp.tab as Tab) : "cargo";
  const q = (sp.q ?? "").trim();

  const [nCargo, nBills, nPayments, nCustomers] = await Promise.all([
    prisma.shipment.count({ where: { deletedAt: null } }),
    prisma.invoice.count(),
    prisma.payment.count(),
    prisma.customer.count(),
  ]);
  const totals: Record<Tab, number> = { cargo: nCargo, bills: nBills, payments: nPayments, customers: nCustomers };

  const like = q ? { contains: q, mode: "insensitive" as const } : undefined;

  let table: React.ReactNode = null;
  if (tab === "cargo") {
    const where: Prisma.ShipmentWhereInput = {
      deletedAt: null,
      ...(like ? { OR: [{ trackingNumber: like }, { customer: { name: like } }] } : {}),
    };
    const rows = await prisma.shipment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: {
        id: true,
        trackingNumber: true,
        status: true,
        weightKg: true,
        pieces: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
    });
    table = (
      <Rows
        head={["Tracking", "Customer", "Status", "Weight", "Pieces", "Added"]}
        empty={rows.length === 0}
        rows={rows.map((r) => [
          <span key="t" className="font-mono text-xs">{r.trackingNumber}</span>,
          r.customer.name,
          <Badge key="s" variant="outline">{humanize(r.status)}</Badge>,
          `${formatWeight(r.weightKg)} kg`,
          r.pieces ?? "—",
          <span key="d" title={eat(r.createdAt)}>{eat(r.createdAt).replace(" EAT", "")}</span>,
        ])}
      />
    );
  } else if (tab === "bills") {
    const where: Prisma.InvoiceWhereInput = like
      ? { OR: [{ invoiceNumber: like }, { customer: { name: like } }] }
      : {};
    const rows = await prisma.invoice.findMany({
      where,
      orderBy: { issuedAt: "desc" },
      take: TAKE,
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        currency: true,
        total: true,
        amountPaid: true,
        issuedAt: true,
        customer: { select: { name: true } },
      },
    });
    table = (
      <Rows
        head={["Bill", "Customer", "Status", "Total", "Paid", "Outstanding", "Issued"]}
        empty={rows.length === 0}
        rows={rows.map((r) => [
          <span key="n" className="font-mono text-xs">{r.invoiceNumber}</span>,
          r.customer.name,
          <Badge key="s" variant="outline">{humanize(r.status)}</Badge>,
          formatMoney(r.total.toString(), r.currency),
          formatMoney(r.amountPaid.toString(), r.currency),
          formatMoney(r.total.minus(r.amountPaid).toString(), r.currency),
          <span key="d">{eat(r.issuedAt).replace(" EAT", "")}</span>,
        ])}
      />
    );
  } else if (tab === "payments") {
    const where: Prisma.PaymentWhereInput = like
      ? { OR: [{ reference: like }, { customer: { name: like } }, { invoice: { invoiceNumber: like } }] }
      : {};
    const rows = await prisma.payment.findMany({
      where,
      orderBy: { paidAt: "desc" },
      take: TAKE,
      select: {
        id: true,
        amount: true,
        creditedAmount: true,
        currency: true,
        method: true,
        reference: true,
        paidAt: true,
        customer: { select: { name: true } },
        invoice: { select: { invoiceNumber: true } },
      },
    });
    table = (
      <Rows
        head={["Paid on", "Customer", "Bill", "Method", "Handed over", "Credited", "Reference"]}
        empty={rows.length === 0}
        rows={rows.map((r) => [
          <span key="d">{eat(r.paidAt).replace(" EAT", "")}</span>,
          r.customer?.name ?? "—",
          <span key="i" className="font-mono text-xs">{r.invoice?.invoiceNumber ?? "—"}</span>,
          humanize(r.method),
          formatMoney(r.amount.toString(), r.currency),
          formatMoney((r.creditedAmount ?? r.amount).toString(), r.currency),
          <span key="r" className="font-mono text-xs">{r.reference ?? "—"}</span>,
        ])}
      />
    );
  } else {
    const where: Prisma.CustomerWhereInput = like
      ? { OR: [{ name: like }, { code: like }, { phone: like }] }
      : {};
    const rows = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: TAKE,
      select: { id: true, code: true, name: true, phone: true, createdAt: true },
    });
    table = (
      <Rows
        head={["Code", "Name", "Phone", "Added"]}
        empty={rows.length === 0}
        rows={rows.map((r) => [
          <span key="c" className="font-mono text-xs">{r.code}</span>,
          r.name,
          r.phone ?? "—",
          <span key="d">{eat(r.createdAt).replace(" EAT", "")}</span>,
        ])}
      />
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Business</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Cargo, bills, payments and customers in read-only tables. Nothing on this page can change anything.
        </p>
      </div>

      <InfoCallout icon={ReceiptText} title="Read only">
        Shows the newest {TAKE} rows for each list; search to find an older one. To fix a wrong figure, tell the owner and
        correct it through the normal screen so it is recorded properly.
      </InfoCallout>

      <div className="flex flex-wrap gap-1.5">
        {TABS.map((x) => (
          <Link
            key={x.key}
            href={`/app/developer/business?tab=${x.key}`}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors",
              tab === x.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {x.label}
            <span className="text-xs tabular-nums opacity-80">{formatNumber(totals[x.key])}</span>
          </Link>
        ))}
      </div>

      <form method="get" className="flex gap-2">
        <input type="hidden" name="tab" value={tab} />
        <Input name="q" defaultValue={q} placeholder="Search…" className="max-w-sm" />
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      <Card>
        <CardContent className="p-0">{table}</CardContent>
      </Card>
    </div>
  );
}

function Rows({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: boolean }) {
  if (empty) return <p className="px-5 py-10 text-center text-sm text-muted-foreground">Nothing matches.</p>;
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {head.map((h) => (
              <TableHead key={h}>{h}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((cells, i) => (
            <TableRow key={i}>
              {cells.map((c, j) => (
                <TableCell key={j} className="whitespace-nowrap text-sm">
                  {c}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
