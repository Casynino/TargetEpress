import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  Boxes,
  ClipboardCheck,
  Clock,
  Package,
  PackagePlus,
  Plane,
  QrCode,
  ScanLine,
  Timer,
  Truck,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";

import { ActivityFeed } from "@/components/app/activity-feed";
import { AlertQueue } from "@/components/app/alert-queue";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { StatStrip } from "@/components/app/stat-strip";
import { AreaChart } from "@/components/charts/area-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { ROLE_LABELS } from "@/lib/constants";
import { formatMoney, formatRelative, formatWeight, toNumber } from "@/lib/format";
import {
  agingInWarehouse,
  attentionItems,
  batchUtilisation,
  chinaStats,
  corridorPerformance,
  darStats,
  executiveStats,
  financeStats,
  monthlyRevenue,
  monthlyVolume,
  recentActivity,
} from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { requireUser } from "@/lib/session";

/** Percentage change, guarding the divide-by-zero that makes dashboards lie. */
function delta(current: number, previous: number): number | undefined {
  if (!previous) return undefined;
  return ((current - previous) / previous) * 100;
}

export default async function DashboardPage() {
  const user = await requireUser();
  const firstName = user.name.split(" ")[0];

  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <>
      <div className="relative mb-6 overflow-hidden rounded-xl border bg-card">
        <div
          aria-hidden
          className="grid-backdrop pointer-events-none absolute inset-0 opacity-[0.35]"
        />
        <div className="relative flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Habari, {firstName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {ROLE_LABELS[user.role]} · {today}
            </p>
          </div>
          {/* Quick actions, offered only where the role actually does them. */}
          <div className="flex flex-wrap gap-2">
            {can(user.role, "shipment.create") ? (
              <Button asChild variant="signal" className="rounded-lg">
                <Link href="/app/shipments/new">
                  <PackagePlus className="mr-2 h-4 w-4" />
                  Register cargo
                </Link>
              </Button>
            ) : null}
            {can(user.role, "shipment.scan") ? (
              <Button
                asChild
                variant={can(user.role, "shipment.create") ? "outline" : "signal"}
                className="rounded-lg"
              >
                <Link href="/app/scan">
                  <ScanLine className="mr-2 h-4 w-4" />
                  Scan QR
                </Link>
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      {user.role === "CHINA_WAREHOUSE" ? <ChinaDashboard role={user.role} /> : null}
      {user.role === "DAR_WAREHOUSE" ? <DarDashboard role={user.role} /> : null}
      {user.role === "FINANCE" ? <FinanceDashboard role={user.role} /> : null}
      {user.role === "ADMIN" ? <ExecutiveDashboard role={user.role} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// China warehouse — the desk that creates everything
// ---------------------------------------------------------------------------

async function ChinaDashboard({ role }: { role: "CHINA_WAREHOUSE" | "ADMIN" }) {
  const [stats, volume, utilisation, alerts, activity, openBatches] = await Promise.all([
    chinaStats(),
    monthlyVolume(),
    batchUtilisation(),
    attentionItems(role),
    recentActivity(8),
    prisma.batch.findMany({
      where: { status: { in: ["OPEN", "READY_TO_DEPART"] } },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: {
        id: true,
        batchNumber: true,
        status: true,
        createdAt: true,
        shipments: { select: { weightKg: true, packages: true } },
      },
    }),
  ]);

  return (
    <div className="space-y-6">
      <StatStrip
        chips={[
          { label: "Staged", value: String(stats.readyToDepart), icon: Package, tone: "warning" },
          { label: "Open batches", value: String(stats.openBatches), icon: Boxes, tone: "brand" },
          { label: "In the air", value: String(stats.inTransitBatches), icon: Plane, tone: "success" },
          { label: "Weight staged", value: formatWeight(stats.stagedWeightKg), icon: Warehouse },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          delay={0}
          label="In China warehouse"
          numeric={stats.readyToDepart}
          hint={`${formatWeight(stats.stagedWeightKg)} waiting for a flight`}
          icon={Package}
          tone="warning"
          href="/app/shipments?status=READY_TO_DEPART"
        />
        <KpiCard
          delay={1}
          label="Registered this month"
          numeric={volume.thisMonth}
          delta={delta(volume.thisMonth, volume.lastMonth)}
          hint="vs last month"
          icon={PackagePlus}
          tone="brand"
          trend={volume.current}
        />
        <KpiCard
          delay={2}
          label="Open batches"
          numeric={stats.openBatches}
          hint="Still taking cargo"
          icon={Boxes}
          tone="info"
          href="/app/batches?status=OPEN"
        />
        <KpiCard
          delay={3}
          label="Batches in transit"
          numeric={stats.inTransitBatches}
          hint="Flying to Dar"
          icon={Plane}
          tone="success"
          href="/app/batches?status=IN_TRANSIT"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="panel p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold">Registration volume</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Shipments registered at the China desk, {volume.year} against{" "}
                {volume.year - 1}
              </p>
            </div>
            <p className="font-display text-2xl font-bold tabular">
              {volume.total.toLocaleString()}
            </p>
          </div>
          <AreaChart
            labels={volume.labels}
            series={[
              { name: String(volume.year), values: volume.current, tone: 1 },
              { name: String(volume.year - 1), values: volume.previous, tone: 2 },
            ]}
          />
        </section>

        <AlertQueue
          items={alerts}
          description="Cargo waiting on the China desk"
          emptyMessage="Every batch is moving. Nothing waiting here."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="font-display font-semibold">Batches on the floor</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Load these, then seal and record the flight.
          </p>
          <ul className="mt-4 space-y-3">
            {openBatches.length === 0 ? (
              <li className="panel-inset p-4 text-sm text-muted-foreground">
                No open batches.{" "}
                <Link href="/app/batches/new" className="text-brand hover:underline">
                  Open one
                </Link>
                .
              </li>
            ) : (
              openBatches.map((batch) => {
                const weight = batch.shipments.reduce(
                  (sum, s) => sum + toNumber(s.weightKg),
                  0
                );
                const packages = batch.shipments.reduce((sum, s) => sum + s.packages, 0);
                return (
                  <li key={batch.id}>
                    <Link
                      href={`/app/batches/${batch.id}`}
                      className="focus-ring block rounded-lg border p-4 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold tabular">
                          {batch.batchNumber}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {batch.status === "OPEN" ? "Loading" : "Sealed"} ·{" "}
                          {formatRelative(batch.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground tabular">
                        {batch.shipments.length} shipment(s) · {packages} package(s) ·{" "}
                        {formatWeight(weight)}
                      </p>
                      <Progress
                        value={batch.shipments.length}
                        max={Math.max(10, batch.shipments.length)}
                        tone={batch.status === "OPEN" ? "brand" : "warning"}
                        striped={batch.status === "OPEN"}
                        className="mt-3"
                        label={`${batch.batchNumber} load`}
                      />
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </section>

        <section className="panel p-5">
          <h2 className="font-display font-semibold">Weight flown per batch</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Recent departures, kilograms per batch
          </p>
          <div className="mt-5">
            <BarChart
              data={utilisation}
              tone={2}
              highlightIndex={utilisation.length - 1}
              formatValue={(n) => `${Math.round(n).toLocaleString()} kg`}
            />
          </div>
        </section>
      </div>

      <ActivityFeed
        entries={activity.map((entry) => ({
          id: entry.id,
          action: entry.action,
          summary: entry.summary,
          createdAt: entry.createdAt,
          actorName: entry.actor?.name ?? entry.actorEmail ?? null,
        }))}
        title="Recent activity"
        description="What the team has done, newest first"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dar warehouse — receiving and releasing
// ---------------------------------------------------------------------------

async function DarDashboard({ role }: { role: "DAR_WAREHOUSE" | "ADMIN" }) {
  const [stats, alerts, activity, perf, incoming] = await Promise.all([
    darStats(),
    attentionItems(role),
    recentActivity(8),
    corridorPerformance(),
    prisma.batch.findMany({
      where: { status: { in: ["IN_TRANSIT", "ARRIVED"] } },
      orderBy: [{ status: "desc" }, { departureDate: "asc" }],
      take: 5,
      select: {
        id: true,
        batchNumber: true,
        status: true,
        airline: true,
        flightNumber: true,
        departureDate: true,
        arrivedAt: true,
        _count: { select: { shipments: true, verifications: true } },
      },
    }),
  ]);

  const checkInBacklog = incoming
    .filter((b) => b.status === "ARRIVED")
    .reduce((sum, b) => sum + (b._count.shipments - b._count.verifications), 0);

  return (
    <div className="space-y-6">
      <StatStrip
        chips={[
          { label: "Inbound", value: String(stats.incoming), icon: Plane, tone: "brand" },
          { label: "To check in", value: String(checkInBacklog), icon: ClipboardCheck, tone: "warning" },
          { label: "Holding", value: String(stats.inWarehouse), icon: Warehouse },
          { label: "Ready", value: String(stats.readyForPickup), icon: Truck, tone: "success" },
          {
            label: "Exceptions",
            value: String(stats.openExceptions),
            icon: AlertTriangle,
            tone: stats.openExceptions ? "danger" : "success",
          },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          delay={0}
          label="Awaiting check-in"
          numeric={checkInBacklog}
          hint={`${stats.awaitingCheck} batch(es) on the floor`}
          icon={ClipboardCheck}
          tone="warning"
          href="/app/receive"
        />
        <KpiCard
          delay={1}
          label="Ready for pickup"
          numeric={stats.readyForPickup}
          hint="Paid, awaiting collection"
          icon={Truck}
          tone="success"
          href="/app/release"
        />
        <KpiCard
          delay={2}
          label="Held in warehouse"
          numeric={stats.inWarehouse}
          hint="Not yet paid for"
          icon={Warehouse}
          tone="info"
          href="/app/shipments?status=RECEIVED_AT_DAR"
        />
        <KpiCard
          delay={3}
          label="Open exceptions"
          numeric={stats.openExceptions}
          hint="Needing a decision"
          icon={AlertTriangle}
          tone={stats.openExceptions ? "danger" : "success"}
          href="/app/exceptions"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <AlertQueue
          items={alerts}
          description="Cargo on the Dar floor needing action"
          emptyMessage="Floor is clear. Every batch checked in."
        />

        <section className="panel p-5">
          <h2 className="font-display font-semibold">Inbound &amp; on the floor</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Batches in the air, and batches landed but not fully checked in
          </p>

          <ul className="mt-4 space-y-3">
            {incoming.length === 0 ? (
              <li className="panel-inset p-4 text-sm text-muted-foreground">
                Nothing inbound.
              </li>
            ) : (
              incoming.map((batch) => {
                const checked = batch._count.verifications;
                const total = batch._count.shipments;
                const arrived = batch.status === "ARRIVED";
                return (
                  <li key={batch.id}>
                    <Link
                      href={arrived ? `/app/receive/${batch.id}` : `/app/batches/${batch.id}`}
                      className="focus-ring block rounded-lg border p-4 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono text-sm font-semibold tabular">
                          {batch.batchNumber}
                        </span>
                        <span
                          className={
                            arrived
                              ? "rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning"
                              : "rounded-full bg-info/10 px-2 py-0.5 text-[11px] font-semibold text-info"
                          }
                        >
                          {arrived ? "On the floor" : "In the air"}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {batch.airline ?? "—"} {batch.flightNumber ?? ""} ·{" "}
                        {arrived
                          ? `landed ${formatRelative(batch.arrivedAt)}`
                          : `departed ${formatRelative(batch.departureDate)}`}
                      </p>
                      {arrived ? (
                        <>
                          <div className="mt-3 flex items-center justify-between text-xs">
                            <span className="text-muted-foreground">Checked in</span>
                            <span className="font-medium tabular">
                              {checked} / {total}
                            </span>
                          </div>
                          <Progress
                            value={checked}
                            max={total}
                            tone={checked === total ? "success" : "warning"}
                            className="mt-1.5"
                            label={`${batch.batchNumber} check-in`}
                          />
                        </>
                      ) : null}
                    </Link>
                  </li>
                );
              })
            )}
          </ul>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="panel p-5">
          <h2 className="font-display font-semibold">Corridor performance</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Measured over the last {perf.sample} delivered shipment(s)
          </p>
          <dl className="mt-5 space-y-4">
            {[
              {
                label: "Flight to warehouse",
                value:
                  perf.avgFlightDays === null
                    ? "—"
                    : `${perf.avgFlightDays.toFixed(1)} days`,
                note: "Departure → checked in at Dar. Ours to control.",
                icon: Plane,
              },
              {
                label: "Waiting for collection",
                value:
                  perf.avgDwellDays === null
                    ? "—"
                    : `${perf.avgDwellDays.toFixed(1)} days`,
                note: "Arrival → collected. Depends on payment and the customer.",
                icon: Clock,
              },
              {
                label: "Within the 3-day promise",
                value:
                  perf.promiseRate === null
                    ? "—"
                    : `${perf.promiseRate.toFixed(0)}%`,
                note: "Share of shipments checked in within 3 days of departure.",
                icon: Timer,
              },
            ].map(({ label, value, note, icon: Icon }) => (
              <div key={label} className="flex gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon className="h-4 w-4" />
                </span>
                <div>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="font-display text-lg font-bold tabular">{value}</dd>
                  <p className="mt-0.5 text-xs text-muted-foreground/80">{note}</p>
                </div>
              </div>
            ))}
          </dl>
        </section>

        <ActivityFeed
          entries={activity.map((entry) => ({
            id: entry.id,
            action: entry.action,
            summary: entry.summary,
            createdAt: entry.createdAt,
            actorName: entry.actor?.name ?? entry.actorEmail ?? null,
          }))}
          title="Recent activity"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finance — money in, money owed
// ---------------------------------------------------------------------------

async function FinanceDashboard({ role }: { role: "FINANCE" | "ADMIN" }) {
  const [stats, aging, alerts, revenue, activity] = await Promise.all([
    financeStats(),
    agingInWarehouse(8),
    attentionItems(role),
    monthlyRevenue(),
    recentActivity(8),
  ]);

  const thisMonth = revenue.values[revenue.values.length - 1] ?? 0;
  const lastMonth = revenue.values[revenue.values.length - 2] ?? 0;
  const collectionRate =
    stats.collected + stats.outstanding > 0
      ? (stats.collected / (stats.collected + stats.outstanding)) * 100
      : 0;

  return (
    <div className="space-y-6">
      <StatStrip
        chips={[
          { label: "Unpaid", value: String(stats.unpaid), icon: Wallet, tone: "danger" },
          { label: "Part-paid", value: String(stats.partiallyPaid), icon: Wallet, tone: "warning" },
          { label: "To invoice", value: String(stats.awaitingInvoice), icon: Package, tone: "brand" },
          { label: "Active notes", value: String(stats.activeNotes), icon: QrCode, tone: "success" },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          delay={0}
          label="Collected this month"
          numeric={thisMonth}
          prefix="TZS "
          delta={delta(thisMonth, lastMonth)}
          hint="vs last month"
          icon={Banknote}
          tone="success"
          trend={revenue.values}
          href="/app/finance/payments"
        />
        <KpiCard
          delay={1}
          label="Outstanding"
          value={formatMoney(stats.outstanding)}
          hint={`${stats.unpaid + stats.partiallyPaid} unsettled invoice(s)`}
          icon={Wallet}
          tone={stats.outstanding > 0 ? "warning" : "success"}
          href="/app/finance/invoices?status=UNPAID"
        />
        <KpiCard
          delay={2}
          label="Collection rate"
          numeric={collectionRate}
          suffix="%"
          ringPct={collectionRate}
          ringLabel="Collection rate"
          hint="Of everything invoiced"
          icon={Timer}
          tone="brand"
        />
        <KpiCard
          delay={3}
          label="Awaiting invoice"
          numeric={stats.awaitingInvoice}
          hint="Cargo not yet billed"
          icon={Package}
          tone="info"
          href="/app/finance/invoices?view=uninvoiced"
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <section className="panel p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold">Collections by month</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Money actually received, this year
              </p>
            </div>
            <p className="font-display text-xl font-bold tabular">
              {formatMoney(revenue.values.reduce((a, b) => a + b, 0))}
            </p>
          </div>
          <BarChart
            data={revenue.labels.map((label, i) => ({
              label,
              value: revenue.values[i] ?? 0,
            }))}
            tone={5}
            highlightIndex={revenue.values.length - 1}
            formatValue={(n) => formatMoney(n)}
          />
        </section>

        <AlertQueue
          items={alerts}
          description="Money and cargo needing a call today"
          emptyMessage="Nothing outstanding. Every invoice is settled."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="panel">
          <header className="flex items-center justify-between border-b px-5 py-4">
            <div>
              <h2 className="font-display font-semibold">Chase list</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Longest-waiting unpaid cargo in the warehouse
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/finance/invoices">All invoices</Link>
            </Button>
          </header>

          {aging.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nothing to chase.
            </p>
          ) : (
            <ul className="divide-y">
              {aging.map((shipment) => {
                const outstanding = shipment.invoice
                  ? toNumber(shipment.invoice.total) -
                    toNumber(shipment.invoice.amountPaid)
                  : null;
                return (
                  <li key={shipment.id}>
                    <Link
                      href={`/app/shipments/${shipment.trackingNumber}`}
                      className="focus-ring flex flex-wrap items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-sm font-medium tabular">
                          {shipment.trackingNumber}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {shipment.customer.name} · {shipment.customer.phone}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold tabular">
                          {outstanding === null
                            ? "Not invoiced"
                            : formatMoney(outstanding, shipment.invoice?.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          waiting {formatRelative(shipment.arrivedAt)}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <ActivityFeed
          entries={activity.map((entry) => ({
            id: entry.id,
            action: entry.action,
            summary: entry.summary,
            createdAt: entry.createdAt,
            actorName: entry.actor?.name ?? entry.actorEmail ?? null,
          }))}
          title="Recent activity"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CEO — the whole business on one screen
// ---------------------------------------------------------------------------

async function ExecutiveDashboard({ role }: { role: "ADMIN" }) {
  const [stats, volume, revenue, perf, alerts, activity, aging] = await Promise.all([
    executiveStats(),
    monthlyVolume(),
    monthlyRevenue(),
    corridorPerformance(),
    attentionItems(role),
    recentActivity(10),
    agingInWarehouse(5),
  ]);

  const thisMonthRevenue = revenue.values[revenue.values.length - 1] ?? 0;
  const lastMonthRevenue = revenue.values[revenue.values.length - 2] ?? 0;
  const deliveredShare =
    stats.active + stats.deliveredThisMonth > 0
      ? (stats.deliveredThisMonth / (stats.active + stats.deliveredThisMonth)) * 100
      : 0;

  return (
    <div className="space-y-6">
      <StatStrip
        chips={[
          { label: "Active", value: String(stats.active), icon: Package, tone: "brand" },
          { label: "In transit", value: String(stats.inTransit), icon: Plane },
          { label: "In Dar", value: String(stats.inWarehouse), icon: Warehouse },
          { label: "Batches", value: String(stats.activeBatches), icon: Boxes },
          { label: "Customers", value: String(stats.customers), icon: Users },
          {
            label: "Exceptions",
            value: String(stats.openExceptions),
            icon: AlertTriangle,
            tone: stats.openExceptions ? "danger" : "success",
          },
        ]}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          delay={0}
          label="Revenue this month"
          numeric={thisMonthRevenue}
          prefix="TZS "
          delta={delta(thisMonthRevenue, lastMonthRevenue)}
          hint={`${formatMoney(stats.allTimeCollected)} all time`}
          icon={Banknote}
          tone="success"
          trend={revenue.values}
          href="/app/admin/reports"
        />
        <KpiCard
          delay={1}
          label="Outstanding"
          value={formatMoney(stats.outstanding)}
          hint="Owed to us"
          icon={Wallet}
          tone={stats.outstanding > 0 ? "warning" : "success"}
          href="/app/finance/invoices?status=UNPAID"
        />
        <KpiCard
          delay={2}
          label="Delivered this month"
          numeric={stats.deliveredThisMonth}
          ringPct={deliveredShare}
          ringLabel="Share of the month's cargo delivered"
          hint={`${stats.active} still moving`}
          icon={Truck}
          tone="brand"
        />
        <KpiCard
          delay={3}
          label="Within 3-day promise"
          value={perf.promiseRate === null ? "—" : `${perf.promiseRate.toFixed(0)}%`}
          ringPct={perf.promiseRate ?? 0}
          ringLabel="Promise adherence"
          hint={`Over ${perf.sample} delivered`}
          icon={Timer}
          tone={
            perf.promiseRate === null
              ? "info"
              : perf.promiseRate >= 80
                ? "success"
                : "warning"
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="panel p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold">Shipment volume</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {volume.year} against {volume.year - 1}
              </p>
            </div>
            <div className="text-right">
              <p className="font-display text-2xl font-bold tabular">
                {volume.total.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">this year</p>
            </div>
          </div>
          <AreaChart
            labels={volume.labels}
            series={[
              { name: String(volume.year), values: volume.current, tone: 1 },
              { name: String(volume.year - 1), values: volume.previous, tone: 2 },
            ]}
          />
        </section>

        <AlertQueue
          items={alerts}
          description="Across every department"
          emptyMessage="Nothing needs your decision. The floor is clear."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="panel p-5 lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display font-semibold">Collections by month</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Money received, {revenue.labels.length} month(s) of {volume.year}
              </p>
            </div>
          </div>
          <BarChart
            data={revenue.labels.map((label, i) => ({
              label,
              value: revenue.values[i] ?? 0,
            }))}
            tone={5}
            highlightIndex={revenue.values.length - 1}
            formatValue={(n) => formatMoney(n)}
          />
        </section>

        <section className="panel p-5">
          <h2 className="font-display font-semibold">Unpaid in warehouse</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Cargo we are storing for free
          </p>
          <ul className="mt-4 divide-y">
            {aging.length === 0 ? (
              <li className="py-6 text-center text-sm text-muted-foreground">
                Nothing outstanding.
              </li>
            ) : (
              aging.map((shipment) => (
                <li
                  key={shipment.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <Link
                    href={`/app/shipments/${shipment.trackingNumber}`}
                    className="font-mono text-sm tabular hover:text-brand"
                  >
                    {shipment.trackingNumber}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(shipment.arrivedAt)}
                  </span>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <ActivityFeed
        entries={activity.map((entry) => ({
          id: entry.id,
          action: entry.action,
          summary: entry.summary,
          createdAt: entry.createdAt,
          actorName: entry.actor?.name ?? entry.actorEmail ?? null,
        }))}
        title="Company activity"
        description="Every privileged action, newest first"
        href="/app/admin/audit"
      />
    </div>
  );
}
