import Link from "next/link";
import type { Metadata } from "next";
import { ShieldCheck } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ResolveExceptionForm } from "@/components/app/resolve-exception-form";
import { Badge } from "@/components/ui/badge";
import { EXCEPTION_TYPE_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Exceptions" };

export default async function ExceptionsPage() {
  const user = await requirePermission("exception.raise");

  const [open, resolved] = await Promise.all([
    prisma.shipmentException.findMany({
      where: { status: "OPEN" },
      orderBy: { raisedAt: "asc" },
      include: {
        raisedBy: { select: { name: true } },
        shipment: {
          select: {
            trackingNumber: true,
            customer: { select: { name: true, phone: true } },
          },
        },
        batch: { select: { batchNumber: true } },
      },
    }),
    prisma.shipmentException.findMany({
      where: { status: { not: "OPEN" } },
      orderBy: { resolvedAt: "desc" },
      take: 25,
      include: {
        raisedBy: { select: { name: true } },
        resolvedBy: { select: { name: true } },
        shipment: { select: { trackingNumber: true } },
      },
    }),
  ]);

  const canResolve = can(user.role, "exception.resolve");

  return (
    <>
      <PageHeader
        title="Exceptions"
        description="Cargo that did not arrive the way the manifest said it would."
      />

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Open ({open.length})
        </h2>

        {open.length === 0 ? (
          <EmptyState
            icon={ShieldCheck}
            title="Nothing outstanding"
            description="Every flagged shipment has been dealt with."
          />
        ) : (
          <ul className="space-y-3">
            {open.map((exception) => (
              <li
                key={exception.id}
                className="rounded-xl border border-destructive/30 bg-card p-5 shadow-soft"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="destructive">
                        {EXCEPTION_TYPE_LABELS[exception.type]}
                      </Badge>
                      <Link
                        href={`/app/cargo/${exception.shipment.trackingNumber}`}
                        className="font-mono text-sm tabular hover:text-brand"
                      >
                        {exception.shipment.trackingNumber}
                      </Link>
                      {exception.batch ? (
                        <span className="font-mono text-xs text-muted-foreground tabular">
                          {exception.batch.batchNumber}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm">{exception.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {exception.shipment.customer.name} ·{" "}
                      {exception.shipment.customer.phone} · raised by{" "}
                      {exception.raisedBy?.name ?? "—"} on{" "}
                      {formatDateTime(exception.raisedAt)}
                    </p>
                  </div>
                </div>

                {canResolve ? (
                  <div className="mt-4 border-t pt-4">
                    <ResolveExceptionForm exceptionId={exception.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {resolved.length > 0 ? (
        <section className="mt-8 space-y-3">
          <h2 className="text-sm font-semibold">Recently resolved</h2>
          <ul className="divide-y rounded-xl border bg-card shadow-soft">
            {resolved.map((exception) => (
              <li key={exception.id} className="px-5 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="muted">
                    {EXCEPTION_TYPE_LABELS[exception.type]}
                  </Badge>
                  <Link
                    href={`/app/cargo/${exception.shipment.trackingNumber}`}
                    className="font-mono text-sm tabular hover:text-brand"
                  >
                    {exception.shipment.trackingNumber}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    resolved by {exception.resolvedBy?.name ?? "—"} ·{" "}
                    {formatDateTime(exception.resolvedAt)}
                  </span>
                </div>
                {exception.resolutionNote ? (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {exception.resolutionNote}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
