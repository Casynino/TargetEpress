import Link from "next/link";
import type { Metadata } from "next";
import type { BatchStatus, Prisma } from "@prisma/client";
import { Boxes, Plus } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { BatchStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { BATCH_STATUS_META, ORIGIN_LABELS } from "@/lib/constants";
import { formatDate, formatWeight, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Batches" };

export default async function BatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requirePermission("batch.view");
  const { status } = await searchParams;

  const statusFilter =
    status && status in BATCH_STATUS_META ? (status as BatchStatus) : undefined;

  const where: Prisma.BatchWhereInput = statusFilter ? { status: statusFilter } : {};

  const batches = await prisma.batch.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      _count: { select: { shipments: true } },
      shipments: { select: { weightKg: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Batches"
        description="Cargo crosses the ocean in batches. Each one carries a full manifest."
        actions={
          can(user.role, "batch.create") ? (
            <Button asChild variant="brand" className="rounded-lg">
              <Link href="/app/batches/new">
                <Plus className="mr-2 h-4 w-4" />
                Open batch
              </Link>
            </Button>
          ) : null
        }
      />

      <form className="mb-4 flex gap-2" action="/app/batches">
        <NativeSelect name="status" defaultValue={status ?? ""} className="sm:w-64">
          <option value="">All batches</option>
          {Object.entries(BATCH_STATUS_META).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </NativeSelect>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {batches.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No batches yet"
          description="Open a batch to start grouping cargo for a flight."
          action={
            can(user.role, "batch.create") ? (
              <Button asChild variant="brand">
                <Link href="/app/batches/new">Open the first batch</Link>
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {batches.map((batch) => {
            const weight = batch.shipments.reduce(
              (sum, s) => sum + toNumber(s.weightKg),
              0
            );
            return (
              <Link
                key={batch.id}
                href={`/app/batches/${batch.id}`}
                className="rounded-xl border bg-card p-5 shadow-soft transition-shadow hover:shadow-lift"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="font-mono text-lg font-semibold tabular">
                    {batch.batchNumber}
                  </p>
                  <BatchStatusBadge status={batch.status} />
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Shipments</dt>
                    <dd className="mt-0.5 font-medium tabular">
                      {batch._count.shipments}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Weight</dt>
                    <dd className="mt-0.5 font-medium tabular">
                      {formatWeight(weight)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Origin</dt>
                    <dd className="mt-0.5 font-medium">
                      {ORIGIN_LABELS[batch.origin]}
                    </dd>
                  </div>
                </dl>

                {batch.airline ? (
                  <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                    {batch.airline} {batch.flightNumber} · departed{" "}
                    {formatDate(batch.departureDate)}
                  </p>
                ) : (
                  <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
                    Opened {formatDate(batch.createdAt)}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
