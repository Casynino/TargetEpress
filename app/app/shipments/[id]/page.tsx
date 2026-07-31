import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, FileText, Plane } from "lucide-react";

import { CargoGrid } from "@/components/app/cargo-grid";
import { PageHeader } from "@/components/app/page-header";
import { BatchStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { ORIGIN_LABELS } from "@/lib/constants";
import { formatDate, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Shipment" };

/**
 * One dispatch: the flight it went on, and everything that travelled on it.
 *
 * Read-only as far as China is concerned. Once a batch is dispatched the
 * warehouse's job is done, and what happens next — arrival, invoicing, payment,
 * collection — belongs to Dar and Finance.
 */
export default async function DispatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("batch.view");
  const { id } = await params;

  const dispatch = await prisma.batch.findUnique({
    where: { id },
    include: {
      verifications: { select: { shipmentId: true, result: true } },
      shipments: {
        orderBy: { trackingNumber: "asc" },
        include: { customer: { select: { name: true } } },
      },
    },
  });

  if (!dispatch) notFound();

  // Loading tables are the live work area, not history.
  if (dispatch.permanent) redirect(`/app/batches/${dispatch.id}`);

  const verificationByShipment = new Map(
    dispatch.verifications.map((v) => [v.shipmentId, v])
  );

  const weight = dispatch.shipments.reduce(
    (sum, cargo) => sum + toNumber(cargo.weightKg),
    0
  );
  const packages = dispatch.shipments.reduce((sum, c) => sum + c.packages, 0);

  return (
    <>
      <PageHeader
        title={dispatch.batchNumber}
        description={`${ORIGIN_LABELS[dispatch.origin]} → Dar es Salaam · ${dispatch.shipments.length} pieces`}
        actions={
          <>
            <BatchStatusBadge status={dispatch.status} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/batches/${dispatch.id}/manifest`}>
                <FileText className="mr-2 h-4 w-4" />
                Manifest
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/shipments">
                <ArrowLeft className="mr-2 h-4 w-4" />
                All shipments
              </Link>
            </Button>
          </>
        }
      />

      <dl className="mb-6 grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Waybill", value: dispatch.waybillNumber ?? "—", mono: true },
          {
            label: "Flight",
            value:
              `${dispatch.airline ?? "—"}${dispatch.flightNumber ? ` ${dispatch.flightNumber}` : ""}`.trim(),
          },
          { label: "Departed", value: formatDate(dispatch.departureDate) },
          {
            label: "Expected",
            value: formatDate(dispatch.expectedArrival),
          },
          { label: "Arrived", value: formatDate(dispatch.arrivalDate) },
          {
            label: "Load",
            value: `${packages} pkg · ${weight.toFixed(1)} kg`,
          },
        ].map((item) => (
          <div key={item.label} className="bg-card p-4">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className={`mt-1 text-sm font-medium ${item.mono ? "font-mono" : ""}`}>
              {item.value || "—"}
            </dd>
          </div>
        ))}
      </dl>

      {dispatch.notes ? (
        <p className="mb-6 rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
          {dispatch.notes}
        </p>
      ) : null}

      <section className="rounded-xl border bg-card shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <h2 className="flex items-center gap-2 font-display font-semibold">
            <Plane className="h-4 w-4 text-brand" />
            Cargo on this flight
          </h2>
          <p className="text-xs tabular-nums text-muted-foreground">
            {dispatch.shipments.length} pieces
          </p>
        </div>
        <div className="p-5">
          <CargoGrid
            cells={dispatch.shipments.map((cargo) => ({
              id: cargo.id,
              trackingNumber: cargo.trackingNumber,
              cartonRef: cargo.cartonRef,
              customerName: cargo.customer.name,
              description: cargo.description,
              weightKg: toNumber(cargo.weightKg),
              packages: cargo.packages,
              status: cargo.status,
              category: cargo.cargoCategory,
              verification: verificationByShipment.get(cargo.id)?.result ?? null,
            }))}
          />
        </div>
      </section>
    </>
  );
}
