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
import { BatchClosePanel } from "@/components/app/batch-close-panel";
import { BatchExpenses } from "@/components/app/batch-expenses";
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
import { batchOwing } from "@/lib/batch-close";
import { batchFinance } from "@/lib/batch-finance";
import {
  COMMON_EXPENSES,
  EXPENSE_APPROVAL_THRESHOLD_USD,
} from "@/lib/expenses";
import { currentRateValue } from "@/lib/fx";
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
      closedBy: { select: { name: true } },
      statement: { select: { status: true, reviewNote: true } },
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

  /*
    Whether this flight's books can be shut, and what is stopping them.

    Same permission as the money: closing is a decision about what will never
    be collected, so a warehouse opening this page is not shown the option and
    is not sent the list of who has not paid.
  */
  const canClose = can(user.role, "batch.close");
  const owing = canClose ? await batchOwing(dispatch.id) : null;

  /*
    Where unpaid cargo could go instead of being given up on.

    Any flight whose books are still open, this one excluded — a debt has to
    land somewhere it can still be chased. The loading tables are excluded too:
    they hold cargo that has not left China, and a Dar debt does not belong on
    one.
  */
  const carryTargets = canClose
    ? await prisma.batch.findMany({
        where: {
          permanent: false,
          closedAt: null,
          id: { not: dispatch.id },
          status: { in: ["IN_TRANSIT", "ARRIVED", "VERIFIED"] },
        },
        orderBy: [{ departureDate: "desc" }, { createdAt: "desc" }],
        take: 20,
        select: { id: true, batchNumber: true },
      })
    : [];

  /* Cargo sitting on THIS batch that flew on a different one. */
  const carriedIn = canClose
    ? await prisma.shipment.findMany({
        where: { batchId: dispatch.id, carriedFromBatchId: { not: null }, deletedAt: null },
        select: {
          trackingNumber: true,
          carriedFromBatch: { select: { batchNumber: true } },
        },
      })
    : [];

  /*
    What this flight cost, fetched on the same permission as what it earned.

    Costs are read here rather than on the central expenses list because this
    is the page where they are known: whoever is looking at GZ/26-28 is the
    person who just paid its clearing agent.
  */
  const canRecordCost = can(user.role, "expense.record");
  const [batchCosts, costAccounts, usedMost, costRate] = finance
    ? await Promise.all([
        prisma.expense.findMany({
          where: { batchId: dispatch.id },
          orderBy: [{ incurredAt: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            expenseNumber: true,
            category: true,
            expenseClass: true,
            description: true,
            note: true,
            vendor: true,
            amount: true,
            currency: true,
            amountUsd: true,
            status: true,
            incurredAt: true,
            account: { select: { name: true } },
            recordedBy: { select: { name: true } },
            _count: { select: { receipts: true } },
          },
        }),
        canRecordCost
          ? prisma.companyAccount.findMany({
              where: { active: true },
              orderBy: [{ kind: "asc" }, { name: "asc" }],
              select: {
                id: true,
                name: true,
                currency: true,
                kind: true,
                accountNumber: true,
              },
            })
          : Promise.resolve([]),
        canRecordCost
          ? prisma.expense.groupBy({
              by: ["description", "category"],
              where: { status: { not: "VOID" } },
              _count: true,
              orderBy: { _count: { description: "desc" } },
              take: 8,
            })
          : Promise.resolve([]),
        canRecordCost ? currentRateValue() : Promise.resolve(null),
      ])
    : [[], [], [], null];

  const quickCosts = (() => {
    const seen = new Set<string>();
    return [
      ...usedMost.map((row) => ({
        label: row.description,
        category: row.category as string,
      })),
      ...COMMON_EXPENSES,
    ]
      .filter((item) => {
        const key = item.label.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 12);
  })();

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

      {/*
        The flight's own facts, as a line rather than a card.

        These are reference — which plane, which waybill, how heavy, what dates.
        Nobody opens a dispatch to read them, they check them in passing, so
        they sit under the title in one row instead of occupying a panel the
        size of the financial summary halfway down the page.
      */}
      <div className="mb-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-lg border bg-card px-4 py-2.5 text-sm">
        <span className="flex items-center gap-1.5 font-medium">
          <Plane className="h-3.5 w-3.5 text-brand" />
          {[dispatch.airline, dispatch.flightNumber].filter(Boolean).join(" ") ||
            t(locale, "Flight not recorded")}
        </span>
        {dispatch.waybillNumber ? (
          <span className="font-mono text-xs text-muted-foreground">
            {t(locale, "Waybill")} {dispatch.waybillNumber}
          </span>
        ) : null}
        {[
          { label: t(locale, "Cargo"), value: `${cargo.length} · ${packages} ${t(locale, "pkg")}` },
          { label: t(locale, "Weight"), value: `${weight.toFixed(1)} kg` },
          { label: t(locale, "Customers"), value: String(customers) },
          { label: t(locale, "Departed"), value: formatDate(dispatch.departureDate, locale) },
          { label: t(locale, "Expected"), value: formatDate(dispatch.expectedArrival, locale) },
          { label: t(locale, "Arrived"), value: formatDate(dispatch.arrivalDate, locale) },
        ].map((f) => (
          <span key={f.label} className="text-xs text-muted-foreground">
            {f.label}{" "}
            <span className="font-medium tabular-nums text-foreground">
              {f.value || "—"}
            </span>
          </span>
        ))}
      </div>

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

      {/* The line under the flight, directly under the figures it draws it
          under. Renders nothing at all until the batch has been checked off
          the manifest, so it never nags a flight that is still in the air. */}
      {owing ? (
        <BatchClosePanel
          state={{
            batchId: dispatch.id,
            batchNumber: dispatch.batchNumber,
            closedAt: dispatch.closedAt
              ? formatDate(dispatch.closedAt, locale)
              : null,
            closedBy: dispatch.closedBy?.name ?? null,
            closeKind: dispatch.closeKind,
            closeNote: dispatch.closeNote,
            verified:
              dispatch.status === "VERIFIED" || dispatch.status === "CLOSED",
            unpaid: owing.unpaid.map((row) => ({
              invoiceId: row.invoiceId,
              trackingNumber: row.trackingNumber,
              customerName: row.customerName,
              owedUsd: row.owedUsd,
            })),
            drafts: owing.drafts,
            unbilled: owing.unbilled,
            rate: finance?.rate ?? null,
            carryTargets,
            freightRate:
              dispatch.freightRatePerKg === null
                ? null
                : toNumber(dispatch.freightRatePerKg),
            customsRate:
              dispatch.customsRatePerKg === null
                ? null
                : toNumber(dispatch.customsRatePerKg),
            /* The weights the rate is about to be multiplied by, so the panel
               can show the product as it is typed. */
            kg: dispatch.shipments
              .filter((piece) => piece.deletedAt === null)
              .reduce((sum, piece) => sum + toNumber(piece.weightKg), 0),
            soldKg: dispatch.shipments
              .filter(
                (piece) =>
                  piece.deletedAt === null && piece.invoice?.status === "PAID"
              )
              .reduce((sum, piece) => sum + toNumber(piece.weightKg), 0),
            worthUsd: finance?.billedUsd ?? 0,
            statementStatus: dispatch.statement?.status ?? null,
            reviewNote: dispatch.statement?.reviewNote ?? null,
            carriedIn: carriedIn.map((row) => ({
              trackingNumber: row.trackingNumber,
              fromBatchNumber: row.carriedFromBatch?.batchNumber ?? "—",
            })),
          }}
        />
      ) : null}

      {finance ? (
        <BatchExpenses
          batchId={dispatch.id}
          batchNumber={dispatch.batchNumber}
          expenses={batchCosts.map((e) => ({
            id: e.id,
            expenseNumber: e.expenseNumber,
            category: e.category as string,
            expenseClass: e.expenseClass as string,
            description: e.description,
            note: e.note,
            vendor: e.vendor,
            amount: toNumber(e.amount),
            currency: e.currency,
            amountUsd: toNumber(e.amountUsd),
            status: e.status as string,
            incurredAt: e.incurredAt.toISOString().slice(0, 10),
            accountName: e.account?.name ?? null,
            recordedBy: e.recordedBy?.name ?? null,
            receipts: e._count.receipts,
          }))}
          accounts={costAccounts}
          rate={costRate}
          canRecord={canRecordCost}
          closed={dispatch.closedAt !== null}
        />
      ) : null}


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
