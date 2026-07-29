import Link from "next/link";
import type { Metadata } from "next";
import { Plane } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ReceiveBatchButton } from "@/components/app/receive-batch-button";
import { BatchStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { ORIGIN_LABELS } from "@/lib/constants";
import { formatDate, formatWeight, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Receive & verify" };

export default async function ReceivePage() {
  await requirePermission("batch.receive");

  const batches = await prisma.batch.findMany({
    where: { status: { in: ["IN_TRANSIT", "ARRIVED"] } },
    orderBy: [{ status: "asc" }, { departureDate: "asc" }],
    include: {
      _count: { select: { shipments: true, verifications: true } },
      shipments: { select: { weightKg: true } },
    },
  });

  return (
    <>
      <PageHeader
        title="Receive & verify"
        description="Batches in the air and batches on the floor waiting to be checked in."
      />

      {batches.length === 0 ? (
        <EmptyState
          icon={Plane}
          title="Nothing inbound"
          description="No batches are in transit or waiting to be checked in."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {batches.map((batch) => {
            const weight = batch.shipments.reduce(
              (sum, s) => sum + toNumber(s.weightKg),
              0
            );
            const remaining =
              batch._count.shipments - batch._count.verifications;

            return (
              <div
                key={batch.id}
                className="rounded-xl border bg-card p-5 shadow-soft"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-lg font-semibold tabular">
                      {batch.batchNumber}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {ORIGIN_LABELS[batch.origin]}
                      {batch.airline
                        ? ` · ${batch.airline} ${batch.flightNumber ?? ""}`
                        : ""}
                    </p>
                  </div>
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
                    <dt className="text-xs text-muted-foreground">Departed</dt>
                    <dd className="mt-0.5 font-medium">
                      {formatDate(batch.departureDate)}
                    </dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4">
                  {batch.status === "IN_TRANSIT" ? (
                    <ReceiveBatchButton batchId={batch.id} />
                  ) : (
                    <>
                      <Button asChild variant="brand" size="sm">
                        <Link href={`/app/receive/${batch.id}`}>
                          Check in cargo
                        </Link>
                      </Button>
                      <span className="text-xs text-muted-foreground">
                        {remaining > 0
                          ? `${remaining} still unchecked`
                          : "All checked — ready to close"}
                      </span>
                    </>
                  )}
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/app/batches/${batch.id}/manifest`}>
                      Print manifest
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
