import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma, ShipmentStatus } from "@prisma/client";
import { PackagePlus, Search } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SHIPMENT_STATUS_META } from "@/lib/constants";
import { formatDate, formatWeight } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Shipments" };

const PAGE_SIZE = 25;

export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const user = await requirePermission("shipment.view");
  const { q, status, page } = await searchParams;

  const currentPage = Math.max(1, Number(page ?? "1") || 1);
  const statusFilter =
    status && status in SHIPMENT_STATUS_META
      ? (status as ShipmentStatus)
      : undefined;

  const where: Prisma.ShipmentWhereInput = {
    ...(statusFilter ? { status: statusFilter } : {}),
    ...(q
      ? {
          OR: [
            { trackingNumber: { contains: q.trim(), mode: "insensitive" } },
            { description: { contains: q.trim(), mode: "insensitive" } },
            { customer: { name: { contains: q.trim(), mode: "insensitive" } } },
            { customer: { phone: { contains: q.trim() } } },
            { batch: { batchNumber: { contains: q.trim(), mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [shipments, total] = await Promise.all([
    prisma.shipment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        trackingNumber: true,
        status: true,
        packages: true,
        weightKg: true,
        description: true,
        registeredAt: true,
        customer: { select: { name: true, phone: true } },
        batch: { select: { batchNumber: true } },
      },
    }),
    prisma.shipment.count({ where }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="Shipments"
        description={`${total.toLocaleString()} shipment${total === 1 ? "" : "s"}`}
        actions={
          can(user.role, "shipment.create") ? (
            <Button asChild variant="brand" className="rounded-lg">
              <Link href="/app/shipments/new">
                <PackagePlus className="mr-2 h-4 w-4" />
                Register cargo
              </Link>
            </Button>
          ) : null
        }
      />

      <form className="mb-4 flex flex-col gap-2 sm:flex-row" action="/app/shipments">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Tracking number, customer, phone or batch"
            className="pl-9"
          />
        </div>
        <NativeSelect name="status" defaultValue={status ?? ""} className="sm:w-56">
          <option value="">All statuses</option>
          {Object.entries(SHIPMENT_STATUS_META).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {shipments.length === 0 ? (
        <EmptyState
          title="No shipments match"
          description="Try a different search, or clear the status filter."
          action={
            <Button asChild variant="outline">
              <Link href="/app/shipments">Clear filters</Link>
            </Button>
          }
        />
      ) : (
        <div className="rounded-xl border bg-card shadow-soft">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tracking</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="hidden md:table-cell">Cargo</TableHead>
                <TableHead className="hidden sm:table-cell">Batch</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">Registered</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shipments.map((shipment) => (
                <TableRow key={shipment.id}>
                  <TableCell>
                    <Link
                      href={`/app/shipments/${shipment.trackingNumber}`}
                      className="font-mono text-sm font-medium tabular hover:text-brand"
                    >
                      {shipment.trackingNumber}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{shipment.customer.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {shipment.customer.phone}
                    </p>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <p className="max-w-[220px] truncate text-sm">
                      {shipment.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {shipment.packages} pkg · {formatWeight(shipment.weightKg)}
                    </p>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <span className="font-mono text-xs tabular text-muted-foreground">
                      {shipment.batch?.batchNumber ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <ShipmentStatusBadge status={shipment.status} />
                  </TableCell>
                  <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                    {formatDate(shipment.registeredAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {currentPage} of {pages}
          </span>
          <div className="flex gap-2">
            {currentPage > 1 ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/app/shipments?${new URLSearchParams({
                    ...(q ? { q } : {}),
                    ...(status ? { status } : {}),
                    page: String(currentPage - 1),
                  })}`}
                >
                  Previous
                </Link>
              </Button>
            ) : null}
            {currentPage < pages ? (
              <Button asChild variant="outline" size="sm">
                <Link
                  href={`/app/shipments?${new URLSearchParams({
                    ...(q ? { q } : {}),
                    ...(status ? { status } : {}),
                    page: String(currentPage + 1),
                  })}`}
                >
                  Next
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
