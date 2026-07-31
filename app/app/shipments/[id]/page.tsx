import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, FileText, Plane, Users } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import {
  ShipmentDetailTabs,
  type CargoLine,
  type DocumentEntry,
  type TimelineEntry,
} from "@/components/app/shipment-detail-tabs";
import { BatchStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { ORIGIN_LABELS, SHIPMENT_STATUS_META } from "@/lib/constants";
import { formatDate, formatDateTime, toNumber } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Shipment" };

/**
 * One dispatch, as a dashboard.
 *
 * The overview card answers the questions a manager asks standing up — how big,
 * how many customers, where is it, when does it land — and the tabs hold the
 * detail for whoever needs to sit down with it.
 */
export default async function ShipmentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("batch.view");
  const { id } = await params;

  const dispatch = await prisma.batch.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      shipments: {
        orderBy: { trackingNumber: "asc" },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          photos: {
            orderBy: { createdAt: "asc" },
            select: { id: true, url: true, caption: true },
          },
        },
      },
    },
  });

  if (!dispatch) notFound();

  // Loading tables are the live work area, not history.
  if (dispatch.permanent) redirect(`/app/batches/${dispatch.id}`);

  const cargo: CargoLine[] = dispatch.shipments.map((item) => ({
    id: item.id,
    trackingNumber: item.trackingNumber,
    cartonRef: item.cartonRef,
    customerId: item.customer.id,
    customerName: item.customer.name,
    customerPhone: item.customer.phone,
    description: item.description,
    category: item.cargoCategory,
    weightKg: toNumber(item.weightKg),
    packages: item.packages,
    status: item.status,
    statusLabel: SHIPMENT_STATUS_META[item.status].label,
    receivedLabel: formatDate(item.registeredAt),
    photos: item.photos,
  }));

  const weight = cargo.reduce((sum, line) => sum + line.weightKg, 0);
  const packages = cargo.reduce((sum, line) => sum + line.packages, 0);
  const customers = new Set(cargo.map((line) => line.customerId)).size;

  // The shipment's own journey, built from the timestamps it actually carries.
  // A step with no timestamp is shown but not marked done — the gap is the
  // information.
  const timeline: TimelineEntry[] = [
    {
      id: "created",
      label: "Dispatch created",
      detail: dispatch.createdBy
        ? `Raised by ${dispatch.createdBy.name}`
        : "Raised in China",
      at: formatDateTime(dispatch.createdAt),
      done: true,
    },
    {
      id: "departed",
      label: "Left China",
      detail:
        [dispatch.airline, dispatch.flightNumber].filter(Boolean).join(" ") ||
        "Flight not recorded",
      at: dispatch.departedAt ? formatDateTime(dispatch.departedAt) : "—",
      done: Boolean(dispatch.departedAt),
    },
    {
      id: "expected",
      label: "Expected in Dar es Salaam",
      detail: dispatch.expectedArrival
        ? "What Dar was told to expect"
        : "No expected date recorded",
      at: dispatch.expectedArrival ? formatDate(dispatch.expectedArrival) : "—",
      done: Boolean(dispatch.expectedArrival),
    },
    {
      id: "arrived",
      label: "Landed",
      detail: dispatch.arrivedAt
        ? "Confirmed by the Dar warehouse"
        : "Not yet confirmed",
      at: dispatch.arrivedAt ? formatDateTime(dispatch.arrivedAt) : "—",
      done: Boolean(dispatch.arrivedAt),
    },
    {
      id: "verified",
      label: "Checked in against the manifest",
      detail: dispatch.verifiedAt
        ? "Every piece accounted for or flagged"
        : "Check-in not finished",
      at: dispatch.verifiedAt ? formatDateTime(dispatch.verifiedAt) : "—",
      done: Boolean(dispatch.verifiedAt),
    },
  ];

  // Attachments are not built yet, so the tab is honest about being empty
  // rather than pretending the feature exists.
  const documents: DocumentEntry[] = [];

  return (
    <>
      <PageHeader
        title={dispatch.batchNumber}
        description={`${ORIGIN_LABELS[dispatch.origin]} → Dar es Salaam`}
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

      {/* Overview card — everything a manager asks standing up. */}
      <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-soft">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b bg-gradient-to-br from-brand/5 to-transparent p-5">
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-brand" />
            <span className="text-sm font-medium">
              {[dispatch.airline, dispatch.flightNumber].filter(Boolean).join(" ") ||
                "Flight not recorded"}
            </span>
          </div>
          {dispatch.waybillNumber ? (
            <span className="font-mono text-sm text-muted-foreground">
              Waybill {dispatch.waybillNumber}
            </span>
          ) : null}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {customers} customer{customers === 1 ? "" : "s"}
          </div>
        </div>

        <dl className="grid gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: "Cargo pieces", value: String(cargo.length) },
            { label: "Packages", value: String(packages) },
            { label: "Total weight", value: `${weight.toFixed(1)} kg` },
            { label: "Departed", value: formatDate(dispatch.departureDate) },
            { label: "Expected", value: formatDate(dispatch.expectedArrival) },
            { label: "Arrived", value: formatDate(dispatch.arrivalDate) },
          ].map((stat) => (
            <div key={stat.label} className="bg-card p-4">
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
              <dd className="mt-1 font-display text-lg font-bold tabular-nums">
                {stat.value || "—"}
              </dd>
            </div>
          ))}
        </dl>

        {dispatch.notes ? (
          <p className="border-t bg-muted/30 p-4 text-sm text-muted-foreground">
            {dispatch.notes}
          </p>
        ) : null}
      </section>

      <ShipmentDetailTabs
        cargo={cargo}
        documents={documents}
        timeline={timeline}
      />
    </>
  );
}
