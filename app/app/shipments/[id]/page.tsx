import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { FileText, Plane, Users, PackagePlus } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import {
  ShipmentDetailTabs,
  type CargoLine,
  type DocumentEntry,
  type TimelineEntry,
} from "@/components/app/shipment-detail-tabs";
import { BatchArrivalUndo } from "@/components/app/batch-arrival-undo";
import { BatchClosePanel } from "@/components/app/batch-close-panel";
import { FlightDetailsForm } from "@/components/app/flight-details-form";
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
import { EXPENSE_CATEGORY_LABELS } from "@/lib/expenses";
import { batchFinance } from "@/lib/batch-finance";
import {
} from "@/lib/expenses";
import { currentRateValue } from "@/lib/fx";
import { cargoLabel } from "@/lib/cargo";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { creditLine, dueLabel } from "@/lib/credit";
import { can } from "@/lib/rbac";
import { claimsForInvoices } from "@/lib/claimed";
import { requirePermission } from "@/lib/session";
import { cargoText, viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Batch") };
}

/**
 * One dispatch, as a dashboard.
 *
 * The overview card answers the questions a manager asks standing up — how big,
 * how many customers, where is it, when does it land — and the tabs hold the
 * detail for whoever needs to sit down with it.
 */
/** yyyy-mm-dd for a date input, which will not take anything else. */
function isoDay(value: Date | null) {
  return value ? value.toISOString().slice(0, 10) : null;
}

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
  /*
    What a batch COST is not everybody's business.

    Customer Care holds finance.view so it can chase what a customer owes and
    manage the invoice. It came with the clearing agent's fee, the expected
    profit and the margin attached, and a whole expense register underneath —
    none of which that desk needs and none of which it should carry around.
    Those follow expense.view: Finance and the owner.
  */
  const showCosts = can(user.role, "expense.view");

  const dispatch = await prisma.batch.findUnique({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      closedBy: { select: { name: true } },
      statement: { select: { status: true, reviewNote: true } },
      shipments: {
        where: { deletedAt: null },
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
              /* Credit gets its own colour on the row, so the row needs to know
                 whether one was granted and whether the date has passed. */
              creditStatus: true,
              dueDate: true,
              creditDecidedAt: true,
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

  /* One instant for every row. A list where each row read its own clock produced
     rows that disagreed about whether today was the due date. */
  const now = new Date();

  /* Which of this flight's bills already has money waiting on Finance. One
     query for the manifest, and only where the reader may see money. */
  const claims = showMoney
    ? await claimsForInvoices(
        dispatch.shipments
          .map((i) => i.invoice?.id)
          .filter((v): v is string => Boolean(v))
      )
    : new Map<string, never>();

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
    chargeableKg: item.chargeableKg === null ? undefined : toNumber(item.chargeableKg),
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
            /* Settled in full — the fact every desk was opening a consignment
               to find out. */
            paid: item.invoice.status === "PAID",
            /* A payment already sent up for this bill and waiting on Finance
               — see lib/claimed.ts. The row turns yellow for it. */
            claimed: claims.has(item.invoice.id),
            /*
              Released on credit, and late or not.

              Derived through creditLine — the same function the Credit page and
              the pickup note use — so a row can never disagree with the
              settlements list about whether a consignment is overdue. Null on
              every ordinary bill, which is almost all of them.
            */
            credit:
              item.invoice.creditStatus === "APPROVED" &&
              item.invoice.status !== "PAID"
                ? (() => {
                    const line = creditLine(item.invoice, now);
                    return { overdue: line.daysOverdue > 0, dueLabel: dueLabel(line) };
                  })()
                : null,
            /* Carried whether or not the price is still editable: taking money
               is exactly what a confirmed, unpaid bill is for. A draft is
               excluded — nobody has signed that figure off, and collecting
               against a number Finance has not looked at is how a bill ends up
               argued about after the cash is in the drawer. */
            invoiceId:
              item.invoice.status === "DRAFT" || item.invoice.status === "VOID"
                ? null
                : item.invoice.id,
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

  const canConfirm = can(user.role, "invoice.manage");

  /*
    Whether this flight's books can be shut, and what is stopping them.

    Same permission as the money: closing is a decision about what will never
    be collected, so a warehouse opening this page is not shown the option and
    is not sent the list of who has not paid.
  */
  const canClose = can(user.role, "batch.close");
  /* The desk that sends the flight is the desk that hears from the airline
     afterwards, so it is the one that keeps these right. */
  const canDispatch = can(user.role, "shipment.depart");
  const canMoveCargo = can(user.role, "shipment.move");

  /*
    Six independent questions about the same dispatch, asked together rather
    than queueing behind one another. Each stays behind exactly the permission
    that gates the panel it feeds; a desk without the permission resolves the
    empty answer without touching the database.
  */
  const [finance, unpaidWeight, costBreakdown, owing, carryTargets, carriedIn] =
    await Promise.all([
      // Only fetched for desks that may see money — the warehouse opens this
      // page too, and a figure never queried cannot leak through a prop.
      can(user.role, "finance.view")
        ? batchFinance(dispatch.id, locale)
        : Promise.resolve(null),

      /* The weight still sitting in the warehouse against an unpaid bill —
         uncollected cargo is floor space as well as money. */
      canClose
        ? prisma.shipment
            .aggregate({
              where: {
                batchId: dispatch.id,
                deletedAt: null,
                invoice: { status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
              },
              _sum: { weightKg: true },
            })
            .then((agg) => toNumber(agg._sum.weightKg))
        : Promise.resolve(0),

      /* What the flight's costs were FOR, so the close summary can say. */
      canClose
        ? prisma.expense
            .groupBy({
              by: ["category"],
              where: {
                batchId: dispatch.id,
                status: { not: "VOID" },
                expenseClass: "OPERATING",
              },
              _sum: { amountUsd: true },
            })
            .then((rows) =>
              rows
                .map((row) => ({
                  label: EXPENSE_CATEGORY_LABELS[row.category] ?? row.category,
                  usd: toNumber(row._sum.amountUsd),
                }))
                .sort((a, b) => b.usd - a.usd)
            )
        : Promise.resolve<{ label: string; usd: number }[]>([]),

      canClose ? batchOwing(dispatch.id) : Promise.resolve(null),

      /*
        Where unpaid cargo could go instead of being given up on.

        Any flight whose books are still open, this one excluded — a debt has to
        land somewhere it can still be chased. The loading tables are excluded
        too: they hold cargo that has not left China, and a Dar debt does not
        belong on one.

        Doubles as where a mis-scanned box could go: a flight whose books are
        shut cannot take cargo, in either direction. Hence shipment.move beside
        batch.close in the gate — the desks that correct a wrong pile are not
        the desks that close flights.
      */
      canClose || canMoveCargo
        ? prisma.batch.findMany({
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
        : Promise.resolve<{ id: string; batchNumber: string }[]>([]),

      /* Cargo sitting on THIS batch that flew on a different one. */
      canClose
        ? prisma.shipment.findMany({
            where: { batchId: dispatch.id, carriedFromBatchId: { not: null }, deletedAt: null },
            select: {
              id: true,
              trackingNumber: true,
              carriedFromBatch: { select: { batchNumber: true } },
            },
          })
        : Promise.resolve<
            {
              id: string;
              trackingNumber: string;
              carriedFromBatch: { batchNumber: string } | null;
            }[]
          >([]),
    ]);

  /*
    What this flight cost, fetched on the same permission as what it earned.

    Costs are read here rather than on the central expenses list because this
    is the page where they are known: whoever is looking at GZ/26-28 is the
    person who just paid its clearing agent.
  */
  const canRecordCost = can(user.role, "expense.record");
  const [batchCosts, costAccounts, costRate] = finance
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
            accountId: true,
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
        canRecordCost ? currentRateValue() : Promise.resolve(null),
      ])
    : [[], [], null];

  /*
    A "most-used cost descriptions" query used to run here and its result was
    thrown away.

    It fed a quick-entry chip list that this page never rendered — the cost panel
    is BatchExpenses, which takes no such prop. So every batch page load, for
    anybody allowed to record a cost, ran a groupBy across the ENTIRE company
    expense table with no batch filter and no date bound, and discarded the
    answer. The equivalent query on the expenses page is bounded to six months
    and is actually used; this one was neither.
  */

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
        /*
          "All batches" used to be a ghost button sitting in the action row,
          last in a wrapping line after the status badge and Manifest — so on a
          phone the way OUT of the page was below the two things you do IN it,
          and it read as a third action rather than as an exit. It goes where
          people look for a way back, above the title, and stands down below
          `lg` because there the shell's own control already says exactly this.
        */
        backTo={{ href: "/app/shipments", label: "Arrived batches", mobile: false }}
        actions={
          <>
            <BatchStatusBadge status={dispatch.status} />
            {/*
              THE FLIGHT'S OWN PAGE IS WHERE A MISSING BOX IS NOTICED.

              The receiving dock sends you here when you open a flight, and
              this is the list somebody is reading when they realise a
              consignment on the floor is not on it. Whatever the flight's
              state: a box surfaces a fortnight after the aircraft was closed
              and still belongs to it.
            */}
            {can(user.role, "shipment.create") &&
            can(user.role, "batch.verify") ? (
              <Button asChild variant="brand" size="sm">
                <Link href={`/app/receive/${dispatch.id}/add`}>
                  <PackagePlus className="mr-2 h-4 w-4" />
                  {t(locale, "Add cargo")}
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <Link href={`/app/batches/${dispatch.id}/manifest`}>
                <FileText className="mr-2 h-4 w-4" />
                {t(locale, "Manifest")}
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

        {/* The yard sends cargo to the airport and waits days for the waybill,
            so these are filled in and corrected long after the lorry left.
            Sits in the strip it edits — the details and the way to fix them in
            the same place. Gone once the flight is closed: the statement is
            signed off and its dates are part of it. */}
        {canDispatch && !dispatch.closedAt ? (
          <FlightDetailsForm
            batchId={dispatch.id}
            batchNumber={dispatch.batchNumber}
            waybillNumber={dispatch.waybillNumber}
            airline={dispatch.airline}
            departureDate={isoDay(dispatch.departureDate)}
            expectedArrival={isoDay(dispatch.expectedArrival)}
            notes={dispatch.notes}
          />
        ) : null}
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
      {finance ? (
        <BatchFinanceBand finance={finance} showCosts={showCosts} />
      ) : null}

      {/* A flight marked in that never landed. Management only, and shut until
          somebody opens it — the warehouse's ordinary day never touches this,
          and it is the storage clock rather than the status that makes it
          urgent. See undoBatchArrival. */}
      {(dispatch.status === "ARRIVED" || dispatch.status === "VERIFIED") &&
      !dispatch.closedAt &&
      can(user.role, "batch.undoArrival") ? (
        <div className="mt-6">
          <BatchArrivalUndo
            batchId={dispatch.id}
            batchNumber={dispatch.batchNumber}
            consignments={
              dispatch.shipments.filter((piece) => piece.deletedAt === null).length
            }
          />
        </div>
      ) : null}

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
            /* The weights the summary reports. */
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
            summary: {
              pieces: finance?.pieces ?? 0,
              packages: dispatch.shipments
                .filter((piece) => piece.deletedAt === null)
                .reduce((sum, piece) => sum + piece.packages, 0),
              customers: finance?.customers ?? 0,
              kg: finance?.weightKg ?? 0,
              expectedUsd: finance?.expectedUsd ?? 0,
              collectedUsd: finance?.receivedUsd ?? 0,
              outstandingUsd: finance?.outstandingUsd ?? 0,
              expensesUsd: finance?.expensesUsd ?? 0,
              expenseByCategory: costBreakdown,
              profitUsd: finance?.netProfitUsd ?? 0,
              sellRate:
                finance && finance.weightKg > 0
                  ? finance.expectedUsd / finance.weightKg
                  : null,
              rateUsed: finance?.rate ?? null,
              unpaidPieces: owing?.unpaid.length ?? 0,
              unpaidKg: unpaidWeight,
              soldKg: dispatch.shipments
                .filter(
                  (piece) =>
                    piece.deletedAt === null && piece.invoice?.status === "PAID"
                )
                .reduce((sum, piece) => sum + toNumber(piece.weightKg), 0),
              unpaidCustomers: new Set(
                (owing?.unpaid ?? []).map((row) => row.customerName)
              ).size,
            },
            statementStatus: dispatch.statement?.status ?? null,
            reviewNote: dispatch.statement?.reviewNote ?? null,
            carriedIn: carriedIn.map((row) => ({
              shipmentId: row.id,
              trackingNumber: row.trackingNumber,
              fromBatchNumber: row.carriedFromBatch?.batchNumber ?? "—",
            })),
          }}
        />
      ) : null}

      {finance && showCosts ? (
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
            accountId: e.accountId ?? null,
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
        canRecordPayment={can(user.role, "payment.submit")}
        canOverridePrice={can(user.role, "invoice.discount")}
        canMoveCargo={canMoveCargo && dispatch.closedAt === null}
        moveTargets={carryTargets}
        cargo={cargo}
        documents={documents}
        timeline={timeline}
      />
    </>
  );
}
