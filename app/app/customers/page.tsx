import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { Search, Users } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Customers" };

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePermission("customer.view");
  const { q } = await searchParams;

  const where: Prisma.CustomerWhereInput = q
    ? {
        OR: [
          { name: { contains: q.trim(), mode: "insensitive" } },
          { phone: { contains: q.trim() } },
          { code: { contains: q.trim(), mode: "insensitive" } },
        ],
      }
    : {};

  const customers = await prisma.customer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { _count: { select: { shipments: true } } },
  });

  return (
    <>
      <PageHeader
        title="Customers"
        description="Every customer is created automatically the first time cargo is registered under their phone number."
      />

      <form className="mb-4 flex gap-2" action="/app/customers">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Name, phone or customer code"
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="outline">
          Search
        </Button>
      </form>

      {customers.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No customers found"
          description="Customers appear here as soon as the China desk registers cargo for them."
        />
      ) : (
        <div className="rounded-xl border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="hidden sm:table-cell">City</TableHead>
                <TableHead className="text-right">Shipments</TableHead>
                <TableHead className="hidden md:table-cell">Since</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-mono text-xs tabular">
                    {customer.code}
                  </TableCell>
                  <TableCell className="text-sm font-medium">
                    {customer.name}
                  </TableCell>
                  <TableCell className="font-mono text-sm tabular">
                    {customer.phone ?? (
                      <span className="font-sans text-xs text-muted-foreground">
                        No phone recorded
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                    {customer.city ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/app/shipments?q=${encodeURIComponent(customer.phone ?? customer.name)}`}
                      className="text-sm tabular hover:text-brand"
                    >
                      {customer._count.shipments}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {formatDate(customer.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
