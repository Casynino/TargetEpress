import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  ClipboardCheck,
  Hourglass,
  Package,
  PackageCheck,
  ScanLine,
  Timer,
  Truck,
  Users,
  Warehouse,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { ShipmentStatusBadge } from "@/components/app/status-badge";
import { StatCard } from "@/components/app/stat-card";
import { WarehouseFlowChart } from "@/components/app/warehouse-flow-chart";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EXCEPTION_TYPE_LABELS, formatPackages } from "@/lib/constants";
import { formatDate, formatWeight } from "@/lib/format";
import { requirePermission } from "@/lib/session";
import {
  FLOW_WEEKS,
  PERIODS,
  parsePeriod,
  periodLabel,
  warehouseReport,
  type Spread,
} from "@/lib/warehouse-reports";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

/** Days need one decimal to be useful and no more to be honest. */
function days(value: number | null): string {
  if (value === null) return "—";
  if (value < 1) return `${Math.round(value * 24)} hrs`;
  return `${value.toFixed(1)} days`;
}

/**
 * One timing metric, with the sample size it rests on.
 *
 * A median next to an average is not clutter here: a single crate nobody
 * collected for months moves the average and leaves the median alone, and the
 * gap between them is the story. Under five completed journeys nothing is
 * claimed at all.
 */
function TimingRow({
  label,
  note,
  spread,
  owner,
}: {
  label: string;
  note: string;
  spread: Spread;
  owner: string;
}) {
  const thin = spread.sample > 0 && spread.sample < 5;

  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-sm font-medium">{label}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
        </div>
        <p className="font-display text-xl font-bold tabular">
          {days(spread.average)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <Badge variant="muted">{owner}</Badge>
        {spread.sample === 0 ? (
          <span>No completed journeys in this window.</span>
        ) : (
          <>
            <span className="tabular">median {days(spread.median)}</span>
            <span className="tabular">longest {days(spread.longest)}</span>
            <span className={cn("tabular", thin && "text-warning")}>
              {spread.sample} measured
              {thin ? " — too few to read as a trend" : ""}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default async function WarehouseReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  await requirePermission("warehouse.reports");

  const { period } = await searchParams;
  const periodDays = parsePeriod(period);
  const report = await warehouseReport(periodDays);
  const window = periodLabel(periodDays).toLowerCase();

  const { throughput, speed, quality, staff, holding } = report;
  const netChange = throughput.shipmentsCheckedIn - throughput.released;

  return (
    <>
      <PageHeader
        title="Warehouse reports"
        description="What the Dar floor moved, how long it took and what went wrong — measured from the receiving and release record itself."
        actions={
          <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
            {PERIODS.map((option) => (
              <Link
                key={option.days}
                href={`/app/reports?period=${option.days}`}
                className={cn(
                  "focus-ring rounded-md px-3 py-1.5 text-sm transition-colors",
                  option.days === periodDays
                    ? "bg-brand text-brand-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {option.label}
              </Link>
            ))}
          </div>
        }
      />

      {/* ---------------------------------------------------------------- */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Throughput · last {window}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Cargo checked in"
            value={throughput.shipmentsCheckedIn}
            hint={`${throughput.packagesCheckedIn.toLocaleString()} boxes · ${formatWeight(throughput.weightCheckedInKg)}`}
            icon={PackageCheck}
            tone="brand"
          />
          <StatCard
            label="Released to customers"
            value={throughput.released}
            hint={
              netChange === 0
                ? "In and out balanced over the window"
                : netChange > 0
                  ? `${netChange} more in than out — the floor is filling`
                  : `${Math.abs(netChange)} more out than in — backlog clearing`
            }
            icon={Truck}
            tone="success"
          />
          <StatCard
            label="Held in the warehouse"
            value={holding.total}
            hint={`${holding.awaitingPayment} awaiting payment · ${holding.readyForPickup} ready · ${formatWeight(holding.weightKg)}`}
            icon={Warehouse}
            tone={holding.total > 0 ? "info" : "neutral"}
            href="/app/inventory"
          />
          <StatCard
            label="Check failure rate"
            value={
              quality.exceptionRate === null
                ? "—"
                : `${quality.exceptionRate.toFixed(1)}%`
            }
            hint={
              quality.checksTotal === 0
                ? "No cargo checked in this window"
                : `${quality.checksFlagged} of ${quality.checksTotal} manifest checks flagged`
            }
            icon={AlertTriangle}
            tone={
              quality.exceptionRate !== null && quality.exceptionRate >= 5
                ? "danger"
                : "neutral"
            }
          />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8">
        <div className="panel">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
            <h2 className="font-display font-semibold">Cargo received per week</h2>
            <p className="text-xs text-muted-foreground">
              Last {FLOW_WEEKS} weeks, against what went out the door
            </p>
          </div>
          <div className="p-5">
            <WarehouseFlowChart weeks={report.weeks} />
          </div>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            A week is counted on the date each shipment was checked in against
            its manifest, and each release on the date it was handed over.
            Independent of the period switch above.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="panel">
          <h2 className="flex items-center gap-2 border-b px-5 py-4 font-display font-semibold">
            <Timer className="h-4 w-4" />
            How long each leg takes
          </h2>
          <div className="divide-y">
            <TimingRow
              label="Landing to checked in"
              note="Flight arrived until the boxes were ticked off the manifest."
              spread={speed.checkInLag}
              owner="Our clock"
            />
            <TimingRow
              label="Checked in to cleared for pickup"
              note="Waiting on the invoice being settled and the pickup note issued."
              spread={speed.arrivalToCleared}
              owner="Finance"
            />
            <TimingRow
              label="Cleared to collected"
              note="Sitting on the floor waiting for the customer to come."
              spread={speed.clearedToCollection}
              owner="Customer"
            />
            <TimingRow
              label="Arrival to collection"
              note="The whole time cargo spends in this warehouse, end to end."
              spread={speed.arrivalToCollection}
              owner="All three"
            />
          </div>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            Measured on cargo collected in the last {window}. The three legs are
            kept apart on purpose — a customer who takes a fortnight to collect
            is not a slow warehouse.
          </p>
        </div>

        <div className="panel">
          <h2 className="flex items-center gap-2 border-b px-5 py-4 font-display font-semibold">
            <ClipboardCheck className="h-4 w-4" />
            What went wrong
          </h2>

          <div className="grid grid-cols-3 divide-x border-b">
            <div className="px-5 py-4">
              <p className="font-display text-xl font-bold tabular">
                {quality.checksTotal}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Manifest checks
              </p>
            </div>
            <div className="px-5 py-4">
              <p
                className={cn(
                  "font-display text-xl font-bold tabular",
                  quality.exceptionsRaised > 0 && "text-warning"
                )}
              >
                {quality.exceptionsRaised}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Exceptions raised
              </p>
            </div>
            <div className="px-5 py-4">
              <p
                className={cn(
                  "font-display text-xl font-bold tabular",
                  quality.exceptionsOpen > 0 && "text-destructive"
                )}
              >
                {quality.exceptionsOpen}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Still open
              </p>
            </div>
          </div>

          {quality.exceptionTypes.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={ClipboardCheck}
                title="Nothing flagged"
                description={`Every shipment checked in over the last ${window} matched its manifest.`}
              />
            </div>
          ) : (
            <ul className="divide-y">
              {quality.exceptionTypes.map((row) => (
                <li
                  key={row.type}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <span className="text-sm">
                    {EXCEPTION_TYPE_LABELS[row.type]}
                  </span>
                  <span className="flex items-center gap-2 text-sm text-muted-foreground tabular">
                    {row.open > 0 ? (
                      <Badge variant="warning">{row.open} open</Badge>
                    ) : null}
                    {row.total}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            {quality.shortPackages > 0 ? (
              <>
                <strong className="font-semibold text-foreground">
                  {quality.shortPackages}
                </strong>{" "}
                {quality.shortPackages === 1 ? "box is" : "boxes are"} still
                missing off cargo already on the floor — those shipments cannot
                be released until they are found.{" "}
              </>
            ) : (
              "No cargo on the floor is short a box. "
            )}
            <Link href="/app/exceptions" className="text-brand hover:underline">
              Open exceptions
            </Link>
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8">
        <div className="panel">
          <h2 className="flex items-center gap-2 border-b px-5 py-4 font-display font-semibold">
            <Users className="h-4 w-4" />
            Who did the work
          </h2>
          {staff.length === 0 ? (
            <div className="p-5">
              <EmptyState title="No floor activity recorded in this window" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Released</TableHead>
                  <TableHead className="text-right">Cargo checked in</TableHead>
                  <TableHead className="text-right">Boxes checked in</TableHead>
                  <TableHead className="text-right">Exceptions raised</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.map((person) => (
                  <TableRow key={person.id}>
                    <TableCell className="text-sm font-medium">
                      {person.name}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {person.released}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {person.shipmentsCheckedIn}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {person.packagesCheckedIn}
                    </TableCell>
                    <TableCell className="text-right tabular">
                      {person.exceptionsRaised}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            Counted over the last {window}. Raising an exception is doing the job
            properly, not a mark against anyone — a desk that never flags
            anything is a desk that is not looking.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8">
        <div className="panel">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-5 py-4">
            <h2 className="flex items-center gap-2 font-display font-semibold">
              <Hourglass className="h-4 w-4" />
              Longest held, still on the floor
            </h2>
            <Link
              href="/app/inventory"
              className="text-xs text-brand hover:underline"
            >
              Full inventory
            </Link>
          </div>
          {holding.oldest.length === 0 ? (
            <div className="p-5">
              <EmptyState
                icon={Boxes}
                title="The floor is clear"
                description="Nothing is being held at the Dar warehouse."
              />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tracking</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    Checked in
                  </TableHead>
                  <TableHead className="hidden md:table-cell">Cargo</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Days held</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {holding.oldest.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/app/cargo/${row.trackingNumber}`}
                        className="font-mono text-sm tabular hover:text-brand"
                      >
                        {row.trackingNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{row.customerName}</TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                      {formatDate(row.arrivedAt)}
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                      {formatPackages(row.packages, row.packageType)}
                    </TableCell>
                    <TableCell>
                      <ShipmentStatusBadge status={row.status} />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-medium tabular",
                        row.daysHeld >= 30 && "text-destructive"
                      )}
                    >
                      {Math.floor(row.daysHeld)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      <section className="mt-8">
        <div className="panel-inset px-5 py-4">
          <h2 className="text-sm font-semibold">What this page does not measure</h2>
          <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
            <li>
              <strong className="font-medium text-foreground">
                Anything in money.
              </strong>{" "}
              Freight charges, storage fees, invoices and outstanding balances
              belong to Finance and are not shown to warehouse staff anywhere in
              this app, including here.
            </li>
            <li>
              <strong className="font-medium text-foreground">
                Damage cost or write-off value.
              </strong>{" "}
              A damaged-cargo exception records what was damaged, never what it
              was worth, so any figure would be invented.
            </li>
            <li>
              <strong className="font-medium text-foreground">
                A collection deadline.
              </strong>{" "}
              Nothing in the system promises a customer a collection date, so
              "days held" is reported as it is rather than dressed up as an
              on-time percentage.
            </li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-3 border-t pt-3 text-xs">
            <Link href="/app/deliveries" className="text-brand hover:underline">
              <Package className="mr-1 inline h-3 w-3" />
              Delivery history
            </Link>
            <Link href="/app/incoming" className="text-brand hover:underline">
              <ScanLine className="mr-1 inline h-3 w-3" />
              Incoming shipments
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
