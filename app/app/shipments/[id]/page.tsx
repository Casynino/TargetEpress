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
import { BatchFinanceBand } from "@/components/app/batch-finance-band";
import { ConfirmPricesBanner } from "@/components/app/confirm-prices-banner";
import { BatchStatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import {
  EXCEPTION_TYPE_LABELS,
  ORIGIN_LABELS,
  SHIPMENT_STATUS_META,
  formatPackagesShort,
} from "@/lib/constants";
import { formatDate, formatDateTime, toNumber } from "@/lib/format";
import { batchFinance } from "@/lib/batch-finance";
import { cargoLabel } from "@/lib/cargo";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { cargoText, viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Shipment") };
}

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
  // The page is a batch.view page; the money band on it is not. Capture the
  // user rather than discarding them, so the band can be gated on its own.
  const user = await requirePermission("batch.view");
  const { id } = await params;
  const locale = await viewerLocale();

  const showMoney = can(user.role, "finance.view");

  const dispatch = await prisma.batch.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      shipments: {
        orderBy: { registeredAt: "desc" },
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          cargoType: { select: { name: true } },
          invoice: {
            select: {
              id: true,
              total: true,
              currency: true,
              status: true,
              freightCost: true,
              freightOverride: true,
              storageCharge: true,
              otherCharges: true,
              discount: true,
              amountPaid: true,
            },
          },
          photos: {
            orderBy: { createdAt: "asc" },
            select: { id: true, url: true, caption: true },
          },
          // Unresolved problems only. A resolved shortage is history; an open
          // one is the reason this line cannot be released.
          exceptions: {
            where: { resolvedAt: null },
            select: { type: true },
            orderBy: { raisedAt: "asc" },
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
    description: cargoLabel(
      item.cargoType?.name,
      cargoText(locale, item, "description")
    , locale),
    category: item.cargoCategory,
    weightKg: toNumber(item.weightKg),
    packages: item.packages,
    packagesLabel: formatPackagesShort(item.packages, item.packageType, locale),
    status: item.status,
    statusLabel: t(locale, SHIPMENT_STATUS_META[item.status].label),
    receivedLabel: formatDate(item.registeredAt, locale),
    problems: item.exceptions.map((exception) =>
      t(locale, EXCEPTION_TYPE_LABELS[exception.type] ?? exception.type)
    ),
    photos: item.photos,
    // Only fetched-and-mapped for desks that may see money; the prop is absent
    // entirely for the warehouse rather than merely unrendered.
    price:
      showMoney && item.invoice
        ? {
            amount: toNumber(item.invoice.total),
            currency: item.invoice.currency,
            confirmed: item.invoice.status !== "DRAFT",
            // Editable only while no money has landed — the same lock
            // adjustInvoice enforces, so the pencil never appears on a bill
            // the server would refuse to change.
            edit:
              toNumber(item.invoice.amountPaid) > 0
                ? null
                : {
                    invoiceId: item.invoice.id,
                    rateBookFreight: toNumber(item.invoice.freightCost),
                    freightOverride:
                      item.invoice.freightOverride === null
                        ? null
                        : toNumber(item.invoice.freightOverride),
                    storage: toNumber(item.invoice.storageCharge),
                    otherCharges: toNumber(item.invoice.otherCharges),
                    discount: toNumber(item.invoice.discount),
                  },
          }
        : null,
  }));

  // Only fetched for desks that may see money — the warehouse opens this page
  // too, and a figure never queried cannot leak through a prop.
  const finance = can(user.role, "finance.view")
    ? await batchFinance(dispatch.id, locale)
    : null;
  const canConfirm = can(user.role, "invoice.manage");

  const weight = cargo.reduce((sum, line) => sum + line.weightKg, 0);
  const packages = cargo.reduce((sum, line) => sum + line.packages, 0);
  const customers = new Set(cargo.map((line) => line.customerId)).size;

  // The shipment's own journey, built from the timestamps it actually carries.
  // A step with no timestamp is shown but not marked done — the gap is the
  // information.
  const timeline: TimelineEntry[] = [
    {
      id: "created",
      label: t(locale, "Dispatch created"),
      detail: dispatch.createdBy
        ? `${t(locale, "Raised by")} ${dispatch.createdBy.name}`
        : t(locale, "Raised in China"),
      at: formatDateTime(dispatch.createdAt, locale),
      done: true,
    },
    {
      id: "departed",
      label: t(locale, "Left China"),
      detail:
        [dispatch.airline, dispatch.flightNumber].filter(Boolean).join(" ") ||
        t(locale, "Flight not recorded"),
      at: dispatch.departedAt ? formatDateTime(dispatch.departedAt, locale) : "—",
      done: Boolean(dispatch.departedAt),
    },
    {
      id: "expected",
      label: t(locale, "Expected in Dar es Salaam"),
      detail: dispatch.expectedArrival
        ? t(locale, "What Dar was told to expect")
        : t(locale, "No expected date recorded"),
      at: dispatch.expectedArrival ? formatDate(dispatch.expectedArrival, locale) : "—",
      done: Boolean(dispatch.expectedArrival),
    },
    {
      id: "arrived",
      label: t(locale, "Landed"),
      detail: dispatch.arrivedAt
        ? t(locale, "Confirmed by the Dar warehouse")
        : t(locale, "Not yet confirmed"),
      at: dispatch.arrivedAt ? formatDateTime(dispatch.arrivedAt, locale) : "—",
      done: Boolean(dispatch.arrivedAt),
    },
    {
      id: "verified",
      label: t(locale, "Checked in against the manifest"),
      detail: dispatch.verifiedAt
        ? t(locale, "Every piece accounted for or flagged")
        : t(locale, "Check-in not finished"),
      at: dispatch.verifiedAt ? formatDateTime(dispatch.verifiedAt, locale) : "—",
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
        description={`${t(locale, ORIGIN_LABELS[dispatch.origin])} → ${t(locale, "Dar es Salaam")}`}
        actions={
          <>
            <BatchStatusBadge status={dispatch.status} />
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/batches/${dispatch.id}/manifest`}>
                <FileText className="mr-2 h-4 w-4" />
                {t(locale, "Manifest")}
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/shipments">
                <ArrowLeft className="mr-2 h-4 w-4" />
                {t(locale, "All shipments")}
              </Link>
            </Button>
          </>
        }
      />

      {/* The job before the numbers: sign the system's prices off. Shown only
          while there is something to sign, and only to desks that may. */}
      {finance && canConfirm ? (
        <ConfirmPricesBanner
          batchId={dispatch.id}
          drafts={finance.drafts}
          totalUsd={finance.draftsUsd}
          currency="USD"
        />
      ) : null}

      {/* Money first, for the desks that came here to ask a money question.
          Everyone else goes straight to the cargo. */}
      {finance ? <BatchFinanceBand finance={finance} /> : null}

      {/* Overview card — everything a manager asks standing up. */}
      <section className="mb-6 overflow-hidden rounded-xl border bg-card shadow-soft">
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 border-b bg-gradient-to-br from-brand/5 to-transparent p-5">
          <div className="flex items-center gap-2">
            <Plane className="h-4 w-4 text-brand" />
            <span className="text-sm font-medium">
              {[dispatch.airline, dispatch.flightNumber].filter(Boolean).join(" ") ||
                t(locale, "Flight not recorded")}
            </span>
          </div>
          {dispatch.waybillNumber ? (
            <span className="font-mono text-sm text-muted-foreground">
              {t(locale, "Waybill")} {dispatch.waybillNumber}
            </span>
          ) : null}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            {customers} {t(locale, customers === 1 ? "customer" : "customers")}
          </div>
        </div>

        <dl className="grid gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
          {[
            { label: t(locale, "Cargo pieces"), value: String(cargo.length) },
            { label: t(locale, "Packages"), value: String(packages) },
            { label: t(locale, "Total weight"), value: `${weight.toFixed(1)} kg` },
            { label: t(locale, "Departed"), value: formatDate(dispatch.departureDate, locale) },
            { label: t(locale, "Expected"), value: formatDate(dispatch.expectedArrival, locale) },
            { label: t(locale, "Arrived"), value: formatDate(dispatch.arrivalDate, locale) },
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
        showPrice={finance !== null}
        canEditPrice={can(user.role, "invoice.edit")}
        canOverridePrice={can(user.role, "invoice.discount")}
        cargo={cargo}
        documents={documents}
        timeline={timeline}
      />
    </>
  );
}
