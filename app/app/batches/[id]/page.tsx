import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, Clock, FileText, Package, Scale, TriangleAlert, Users } from "lucide-react";

import { CargoGrid } from "@/components/app/cargo-grid";
import { KpiCard } from "@/components/app/kpi-card";
import { DispatchForm } from "@/components/app/dispatch-form";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { CATEGORY_LABELS, categoryFitsRoute } from "@/lib/cargo";
import { ORIGIN_LABELS, SHIPMENT_STATUS_META } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Batch" };

const ROUTE_LABEL: Record<string, string> = {
  GUANGZHOU: "Guangzhou Batch",
  HONG_KONG: "Hong Kong Batch",
};

/**
 * What each batch is for, said once here rather than on every row.
 *
 * The batch defines the category, so repeating "Normal goods" eighty-five times
 * down a column tells the reader nothing they did not know from the title.
 */
const ROUTE_CATEGORY: Record<string, string> = {
  GUANGZHOU: "Normal goods",
  HONG_KONG: "Electronics & special goods",
};

/**
 * One loading table: everything on it, and the button that sends it.
 *
 * There is no "add cargo" and no "remove cargo" here. Cargo arrives on this
 * table by being registered and leaves it by being dispatched. Letting a clerk
 * move pieces between tables by hand is exactly the mistake the route rule
 * exists to prevent.
 */
export default async function LoadingTablePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requirePermission("batch.view");
  const { id } = await params;

  const batch = await prisma.batch.findUnique({
    where: { id },
    include: {
      verifications: { select: { shipmentId: true, result: true } },
      shipments: {
        orderBy: { registeredAt: "asc" },
        include: {
          customer: { select: { name: true, phone: true } },
          createdBy: { select: { name: true } },
          photos: {
            orderBy: { createdAt: "asc" },
            select: { id: true, url: true, kind: true, caption: true },
          },
        },
      },
    },
  });

  if (!batch) notFound();

  // A dispatch record lives under Shipments now; only loading tables are here.
  if (!batch.permanent) redirect(`/app/shipments/${batch.id}`);

  const canDispatch = can(user.role, "shipment.depart");

  const verificationByShipment = new Map(
    batch.verifications.map((v) => [v.shipmentId, v])
  );

  const waiting = batch.shipments.filter((s) => s.status === "READY_TO_DEPART");
  const totalWeight = waiting.reduce((sum, s) => sum + toNumber(s.weightKg), 0);
  const totalPackages = waiting.reduce((sum, s) => sum + s.packages, 0);

  // Cargo whose category says it belongs on the other table. Should be
  // impossible now that assignment is automatic, so if it appears something is
  // wrong and silence would be the worst response.
  const misrouted = waiting.filter(
    (shipment) => !categoryFitsRoute(shipment.cargoCategory, batch.origin)
  );

  const customers = new Set(waiting.map((s) => s.customerId)).size;

  // How long the oldest piece has been sitting. This is the number that decides
  // whether a batch should go today — cargo ageing on the floor is a customer
  // wondering where their goods are.
  const oldest = waiting.reduce<Date | null>(
    (earliest, cargo) =>
      !earliest || cargo.registeredAt < earliest ? cargo.registeredAt : earliest,
    null
  );
  const daysWaiting = oldest
    ? Math.max(
        0,
        Math.floor((Date.now() - oldest.getTime()) / (1000 * 60 * 60 * 24))
      )
    : 0;

  return (
    <>
      <PageHeader
        title={ROUTE_LABEL[batch.origin] ?? batch.batchNumber}
        description={`${ROUTE_CATEGORY[batch.origin]} waiting in China for the ${ORIGIN_LABELS[batch.origin]} flight. This table is permanent — it empties when you dispatch it, then fills again.`}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/batches/${batch.id}/manifest`}>
                <FileText className="mr-2 h-4 w-4" />
                Manifest
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/batches">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Both batches
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          delay={0}
          label="Cargo waiting"
          numeric={waiting.length}
          hint={`${totalPackages} package${totalPackages === 1 ? "" : "s"}`}
          icon={Package}
          tone="brand"
        />
        <KpiCard
          delay={1}
          label="Total weight"
          value={`${totalWeight.toFixed(1)} kg`}
          hint="What the flight will carry"
          icon={Scale}
          tone="info"
        />
        <KpiCard
          delay={2}
          label="Customers"
          numeric={customers}
          hint="Waiting on this flight"
          icon={Users}
          tone="signal"
        />
        <KpiCard
          delay={3}
          label="Oldest piece"
          value={daysWaiting === 0 ? "Today" : `${daysWaiting} days`}
          hint={
            oldest
              ? `Received ${oldest.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}`
              : "Nothing waiting"
          }
          icon={Clock}
          tone={daysWaiting >= 7 ? "warning" : "success"}
        />
      </div>

      {misrouted.length > 0 ? (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
          <div className="min-w-0">
            <p className="font-medium">
              {misrouted.length} piece{misrouted.length === 1 ? "" : "s"} on this
              table belong{misrouted.length === 1 ? "s" : ""} on the other one
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Assignment is automatic, so this should not happen. Check the cargo
              category before dispatching.
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {misrouted.map((shipment) => (
                <li key={shipment.id}>
                  <Link
                    href={`/app/cargo/${shipment.trackingNumber}`}
                    className="font-mono text-xs hover:text-brand hover:underline"
                  >
                    {shipment.trackingNumber}
                  </Link>
                  <span className="ml-2 text-muted-foreground">
                    {shipment.description} —{" "}
                    {CATEGORY_LABELS[shipment.cargoCategory]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {canDispatch ? (
        <div className="mb-6">
          <DispatchForm
            batchId={batch.id}
            routeLabel={ROUTE_LABEL[batch.origin] ?? "batch"}
            cargoCount={waiting.length}
            weightKg={totalWeight}
            packages={totalPackages}
          />
        </div>
      ) : null}

      <section className="rounded-xl border bg-card shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
          <h2 className="font-display font-semibold">On this table</h2>
          <p className="text-xs tabular-nums text-muted-foreground">
            {waiting.length} piece(s) · {totalPackages} package(s) ·{" "}
            {totalWeight.toFixed(1)} kg
          </p>
        </div>

        {waiting.length === 0 ? (
          <div className="p-12 text-center">
            <p className="font-medium">Nothing waiting</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Cargo appears here the moment the desk registers it. Nobody has to
              put it here.
            </p>
          </div>
        ) : (
          <div className="p-5">
            <CargoGrid
              cells={waiting.map((shipment) => ({
                id: shipment.id,
                trackingNumber: shipment.trackingNumber,
                cartonRef: shipment.cartonRef,
                customerName: shipment.customer.name,
                description: shipment.description,
                weightKg: toNumber(shipment.weightKg),
                packages: shipment.packages,
                status: shipment.status,
                category: shipment.cargoCategory,
                verification:
                  verificationByShipment.get(shipment.id)?.result ?? null,
                statusLabel: SHIPMENT_STATUS_META[shipment.status].label,
                receivedBy: shipment.createdBy?.name ?? null,
                photos: shipment.photos,
              }))}
              batchId={batch.id}
            />
          </div>
        )}
      </section>
    </>
  );
}
