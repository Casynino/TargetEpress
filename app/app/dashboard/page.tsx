import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  Boxes,
  ClipboardCheck,
  Clock,
  Hourglass,
  Landmark,
  Package,
  PackageCheck,
  PackageSearch,
  PackagePlus,
  Plane,
  Printer,
  QrCode,
  Scale,
  ShieldCheck,
  ScanLine,
  Timer,
  TrendingDown,
  Truck,
  UserCog,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";

import { ActivityFeed } from "@/components/app/activity-feed";
import { ActionPills, type ActionPill } from "@/components/app/action-pills";
import { CargoSearch } from "@/components/app/cargo-search";
import { AlertQueue } from "@/components/app/alert-queue";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { SectionLabel } from "@/components/app/section-label";
import { StatStrip } from "@/components/app/stat-strip";
import { WorkList, type WorkItem } from "@/components/app/work-list";
import { AreaChart } from "@/components/charts/area-chart";
import { AgeingBar } from "@/components/charts/ageing-bar";
import { Donut } from "@/components/charts/donut";
import { BarChart } from "@/components/charts/bar-chart";
import { FlowBars } from "@/components/charts/flow-bars";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EXCEPTION_OPEN_STATUSES,
  ROLE_LABELS,
  STORAGE_POLICY,
} from "@/lib/constants";
import {
  floorAgeing,
  floorComposition,
  floorFlowByDay,
  floorSnapshot,
  type FloorSnapshot,
} from "@/lib/floor";
import { MoneyTile } from "@/components/app/money-tile";
import { formatMoney, formatRelative, formatWeight, toNumber } from "@/lib/format";
import { currentRate, formatUsd } from "@/lib/fx";
import { activeAccounts } from "@/lib/accounts";
import { accountBalances } from "@/lib/ledger";
import {
  agingInWarehouse,
  attentionItems,
  batchUtilisation,
  cargoMix,
  chinaStats,
  corridorPerformance,
  executiveStats,
  financeStats,
  monthlyRevenue,
  receivablesAgeing,
  cashFlowByMonth,
  monthlyVolume,
  recentActivity,
} from "@/lib/queries";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/rbac";
import { CargoMix } from "@/components/app/cargo-mix";
import {
  FloorChips,
  WarehouseHero,
  type HeroChip,
} from "@/components/app/warehouse-hero";
import { todaySummary } from "@/lib/warehouse-home";
import { requireUser } from "@/lib/session";

/** Midnight where the cargo is, in the server's local zone. */
function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Percentage change, guarding the divide-by-zero that makes dashboards lie. */
/** The hour where the warehouse is standing, not where the server is. */
function localHour(side: "CN" | "TZ") {
  const hour = Number(
    new Date().toLocaleString("en-GB", {
      timeZone: side === "CN" ? "Asia/Shanghai" : "Africa/Dar_es_Salaam",
      hour: "2-digit",
      hour12: false,
    })
  );
  return Number.isNaN(hour) ? 9 : hour;
}

function delta(current: number, previous: number): number | undefined {
  if (!previous) return undefined;
  return ((current - previous) / previous) * 100;
}

/** China's banner numbers: what the registration desk booked in today. */
async function chinaHeroChips(): Promise<HeroChip[]> {
  const summary = await todaySummary();
  return [
    { icon: Package, label: "Cargo today", value: String(summary.shipments) },
    {
      icon: Scale,
      label: "Weight today",
      value: `${summary.weightKg.toFixed(1)} kg`,
    },
    {
      icon: Printer,
      label: "Labels printed",
      value: String(summary.labelsPrinted),
    },
  ];
}

/**
 * Dar's banner numbers: what came off a manifest today.
 *
 * `arrivedAt` is stamped in exactly one place — verifyShipment — so this is the
 * receiving desk's own work. The banner used to show a Dar user China's
 * registrations and printed labels under "here is what is happening today",
 * which is somebody else's day in a nice box.
 */
async function darHeroChips(floor: FloorSnapshot): Promise<HeroChip[]> {
  const checkedIn = await prisma.shipment.aggregate({
    where: { arrivedAt: { gte: startOfToday() } },
    _count: true,
    _sum: { weightKg: true, packages: true },
  });

  // The standing total on top, today's movement against it underneath.
  //
  // These three read "what is in my building" before they read "what happened
  // today", because the first question is the one a floor supervisor is asked
  // and the second is only ever zero at eight in the morning. A banner whose
  // every number is 0 until the first batch lands teaches people to skip it.
  const shortBoxes = floor.declaredPackages - floor.packages;

  return [
    {
      icon: Boxes,
      label: "Cargo in the warehouse",
      value: String(floor.shipments),
      href: "/app/inventory",
      sub: checkedIn._count
        ? `${checkedIn._count} checked in today`
        : "Nothing checked in yet today",
    },
    {
      icon: PackageCheck,
      label: "Boxes on the floor",
      value: floor.packages.toLocaleString(),
      href: "/app/inventory",
      sub: shortBoxes
        ? `${shortBoxes} short of the manifest`
        : `All ${floor.declaredPackages.toLocaleString()} accounted for`,
    },
    {
      icon: Scale,
      label: "Weight on the floor",
      value: formatWeight(floor.weightKg),
      href: "/app/inventory",
      sub: `${formatWeight(toNumber(checkedIn._sum.weightKg ?? 0))} checked in today`,
    },
  ];
}

export default async function DashboardPage() {
  const user = await requireUser();

  /**
   * Customer Care's home is the support desk, not this page.
   *
   * This route renders one dashboard per role and never had a branch for
   * CUSTOMER_CARE, so that desk landed on a greeting banner and a blank screen
   * below it. The answer is not a sixth dashboard: /app/support already IS
   * their dashboard — the search box, the call list, the ticket and sourcing
   * queues — and building a second one here would be two screens answering one
   * question.
   *
   * The sidebar drops its "Dashboard" row for this role to match, so there is
   * one door rather than two. This redirect stays for anyone who bookmarked
   * the old one.
   */
  if (user.role === "CUSTOMER_CARE") redirect("/app/support");

  // Read the name from the record, not the session. The session token carries
  // whatever the name was at sign-in, so someone who renames themselves would
  // be greeted by their old name until they signed out and back in.
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { name: true },
  });
  const firstName = (me?.name ?? user.name).split(" ")[0];


  const today = new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const warehouse =
    user.role === "CHINA_WAREHOUSE" || user.role === "DAR_WAREHOUSE";
  const inChina = user.role === "CHINA_WAREHOUSE";

  // Read once and handed down. The banner and the floor panel below it both
  // describe the same stock, and two calls a second apart is how they end up
  // disagreeing by one box on screen.
  const floor = user.role === "DAR_WAREHOUSE" ? await floorSnapshot() : null;

  // The floor's standing numbers. Computed here because the banner used to
  // carry them and the data is fetched at this level; rendered below the quick
  // actions, where a figure nobody acts on belongs.
  const floorChips: HeroChip[] = warehouse
    ? inChina
      ? await chinaHeroChips()
      : await darHeroChips(floor!)
    : [];

  return (
    <>
      {/* The warehouses get the banner with both clocks and today's numbers;
          everyone else keeps the plain greeting. Finance does not care what
          time it is in Guangzhou. */}
      {warehouse ? (
        <WarehouseHero
          firstName={firstName}
          warehouseName={inChina ? "China Warehouse" : "Dar es Salaam Warehouse"}
          emphasis={inChina ? "CN" : "TZ"}
          // Where this desk's day starts.
          //
          // China registers cargo, so their day begins at the registration
          // form. Dar's begins at the scanner: checking a batch in, finding a
          // box, handing it over — every one of those starts by reading a
          // label China already printed. "Receive cargo" was borrowed from the
          // China desk and named the wrong action for Dar.
          action={
            can(user.role, "shipment.create")
              ? { href: "/app/cargo/new", label: "Receive cargo" }
              : { href: "/app/scan", label: "Scan a label" }
          }
          // The same box the money and support desks open on. The floor is
          // asked "where is my cargo" all day too.
          search={{ action: "/app/search" }}
          hourOfDay={localHour(inChina ? "CN" : "TZ")}
        />
      ) : (
      /* The desk's own colours, not a stock gradient: the red comes off the
         Target mark and the blue is what the app uses for anything you can
         act on. The hairline grid over the top keeps it reading as freight
         software rather than a marketing banner. */
      <div className="relative mb-6 overflow-hidden rounded-2xl">
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-signal via-brand to-info"
        />
        <div
          aria-hidden
          className="grid-backdrop pointer-events-none absolute inset-0 opacity-20"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/5"
        />
        <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between">
          {/* flex-1 so this column takes the width it is given. Without it the
              column shrinks to its own text and max-w-2xl on the search below
              never applies — a max is not a width, so the box came out the
              length of the greeting above it. */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-white/90" />
                {today}
              </span>
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm">
                {ROLE_LABELS[user.role]}
              </span>
            </div>
            <h1 className="mt-3 font-display text-[32px] font-bold leading-none tracking-tight text-white">
              Habari, {firstName}
            </h1>
            <p className="mt-2 text-sm text-white/80">
              {user.role === "FINANCE"
                ? "Here is the money, and what is waiting on you."
                : "Here is what is happening at Target Express today."}
            </p>
            {/* The same box the support desk opens on. Every desk that is not
                holding the box finds one this way — a customer reads out a
                number and it has to go somewhere without hunting for a page
                first. Posts to /app/search rather than the support desk's own
                search, which is gated on ticket.manage. */}
            <div className="mt-4 max-w-2xl">
              <CargoSearch action="/app/search" />
            </div>
          </div>
          {/* Quick actions, offered only where the role actually does them.
              Styled against the gradient rather than the page, or a solid
              button sits on it like a sticker. */}
          <div className="flex flex-wrap gap-2">
            {can(user.role, "shipment.create") ? (
              <Link
                href="/app/cargo/new"
                className="focus-ring inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand shadow-lift transition-colors hover:bg-white/90"
              >
                <PackagePlus className="mr-2 h-4 w-4" />
                Receive cargo
              </Link>
            ) : null}
            {can(user.role, "shipment.scan") ? (
              <Link
                href="/app/scan"
                className={
                  can(user.role, "shipment.create")
                    ? "focus-ring inline-flex items-center rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/25"
                    : "focus-ring inline-flex items-center rounded-lg bg-white px-4 py-2 text-sm font-semibold text-brand shadow-lift transition-colors hover:bg-white/90"
                }
              >
                <ScanLine className="mr-2 h-4 w-4" />
                Scan QR
              </Link>
            ) : null}
          </div>
        </div>
      </div>
      )}

      {user.role === "CHINA_WAREHOUSE" ? (
        <ChinaDashboard role={user.role} userId={user.id} chips={floorChips} />
      ) : null}
      {user.role === "DAR_WAREHOUSE" ? (
        <DarDashboard role={user.role} userId={user.id} floor={floor!} chips={floorChips} />
      ) : null}
      {user.role === "FINANCE" ? (
        <FinanceDashboard role={user.role} />
      ) : null}
      {user.role === "ADMIN" ? <ExecutiveDashboard role={user.role} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// China warehouse — the desk that creates everything
// ---------------------------------------------------------------------------

async function ChinaDashboard({
  role,
  userId,
  chips,
}: {
  chips: HeroChip[];
  role: "CHINA_WAREHOUSE" | "ADMIN";
  userId: string;
}) {
  const [stats, volume, utilisation, mix, activity, openBatches] = await Promise.all([
    chinaStats(),
    monthlyVolume(),
    batchUtilisation(),
    cargoMix(30),
    recentActivity(8, userId),
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
    <div className="space-y-7">
      <ActionPills
        items={[
          { href: "/app/cargo/new", label: "Register cargo", icon: PackagePlus, weight: "primary" },
          { href: "/app/batches", label: "Load a batch", icon: Plane, weight: "secondary" },
          { href: "/app/shipments", label: "Shipments", icon: Package },
          { href: "/app/search", label: "Find cargo", icon: PackageSearch },
          { href: "/app/customers", label: "Customers", icon: Users },
        ]}
      />

      <FloorChips chips={chips} />

      <StatStrip
        chips={[
          { label: "Staged", value: String(stats.readyToDepart), icon: Package, tone: "warning" },
          { label: "In the air", value: String(stats.inTransitShipments), icon: Plane, tone: "success" },
          { label: "Weight staged", value: formatWeight(stats.stagedWeightKg), icon: Warehouse },
        ]}
      />

      <div>
        <SectionLabel action={{ href: "/app/shipments", label: "All shipments" }}>
          The desk &middot; right now
        </SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          delay={0}
          label="In China warehouse"
          numeric={stats.readyToDepart}
          hint={`${formatWeight(stats.stagedWeightKg)} waiting for a flight`}
          icon={Package}
          tone="warning"
          href="/app/cargo?status=READY_TO_DEPART"
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
          label="Shipments in transit"
          numeric={stats.inTransitShipments}
          hint="In the air to Dar"
          icon={Plane}
          tone="success"
          href="/app/batches?status=IN_TRANSIT"
        />
        </div>
      </div>

      <div>
        <SectionLabel>Volume &amp; mix</SectionLabel>
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

        {/* This used to be the alert queue, which for the China desk only ever
            said "the loading table is open" — the same sentence as the panel
            below it. What is missing from the page is not another count but
            what the cargo *is*. */}
        <CargoMix
          slices={mix.slices}
          totalShipments={mix.totalShipments}
          totalWeightKg={mix.totalWeightKg}
          periodLabel={`Received in the last ${mix.days} days`}
        />
        </div>
      </div>

      <div>
        <SectionLabel action={{ href: "/app/batches", label: "All batches" }}>
          Batches on the floor
        </SectionLabel>
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
      </div>

      <ActivityFeed
        entries={activity.map((entry) => ({
          id: entry.id,
          action: entry.action,
          summary: entry.summary,
          createdAt: entry.createdAt,
          actorName: entry.actor?.name ?? entry.actorEmail ?? null,
        }))}
        title="Your activity"
        description="What you have done, newest first"
        showActor={false}
        emptyMessage="Nothing recorded against your account yet."
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dar warehouse — receiving and releasing
// ---------------------------------------------------------------------------

/**
 * The five numbers the Dar floor is measured by, in one round trip.
 *
 * Each one is a state the cargo is actually in, and the states do not overlap:
 * a shipment in the air is counted as incoming, and the moment its batch is
 * marked arrived the same shipment moves to awaiting-verification instead of
 * appearing under both. A card that double-counts is a card nobody trusts.
 */
async function darFloorStats() {
  const since = startOfToday();

  const [
    inAir,
    batchesInAir,
    awaitingVerification,
    batchesOnFloor,
    ready,
    released,
    exceptions,
  ] = await Promise.all([
    // Still flying. Cargo whose batch has landed is on the floor, not incoming.
    prisma.shipment.aggregate({
      where: { status: "IN_TRANSIT", batch: { status: "IN_TRANSIT" } },
      _count: true,
      _sum: { weightKg: true },
    }),
    prisma.batch.count({ where: { status: "IN_TRANSIT" } }),
    // Landed, but not yet ticked off the manifest. verifyShipment writes a
    // BatchVerification row for both outcomes, so "no row" is the true backlog.
    prisma.shipment.count({
      where: {
        status: "IN_TRANSIT",
        batch: { status: "ARRIVED" },
        verifications: { none: {} },
      },
    }),
    prisma.batch.count({ where: { status: "ARRIVED" } }),
    // Finance issues the pickup note and flips the status in the same
    // transaction, so this is exactly the paid, collectable cargo.
    prisma.shipment.aggregate({
      where: { status: "READY_FOR_PICKUP" },
      _count: true,
      _sum: { packages: true },
    }),
    prisma.shipment.aggregate({
      where: { status: "DELIVERED", deliveredAt: { gte: since } },
      _count: true,
      _sum: { packages: true },
    }),
    prisma.shipmentException.groupBy({
      by: ["type"],
      where: { status: { in: [...EXCEPTION_OPEN_STATUSES] }, shipment: { deletedAt: null } },
      _count: { _all: true },
    }),
  ]);

  const tally = (rows: typeof exceptions) =>
    rows.reduce((sum, row) => sum + row._count._all, 0);

  const missing = tally(
    exceptions.filter(
      (row) =>
        row.type === "MISSING_SHIPMENT" || row.type === "PACKAGE_COUNT_MISMATCH"
    )
  );
  const damaged = tally(exceptions.filter((row) => row.type === "DAMAGED_CARGO"));
  const openExceptions = tally(exceptions);

  return {
    incoming: inAir._count,
    incomingWeightKg: toNumber(inAir._sum.weightKg ?? 0),
    batchesInAir,
    awaitingVerification,
    batchesOnFloor,
    readyForPickup: ready._count,
    readyPackages: ready._sum.packages ?? 0,
    releasedToday: released._count,
    releasedPackages: released._sum.packages ?? 0,
    openExceptions,
    missing,
    damaged,
  };
}

/**
 * The five things this floor starts a job from.
 *
 * Every one of them is pressed many times a shift. Warehouse Inventory,
 * Delivery History and Reports are deliberately absent — they are read, not
 * started, and they are one click away in the sidebar. A shortcut row that
 * lists everything is a second sidebar, which helps nobody.
 *
 * Each destination keeps the colour it has everywhere else in the app — the
 * Issues & Claims is amber on this floor, on the finance desk and on the
 * support desk. Colour is only a landmark while it means the same thing twice.
 */
const DAR_QUICK_ACTIONS: ActionPill[] = [
  { href: "/app/receive", label: "Receiving dock", icon: PackagePlus, weight: "primary", tone: "brand" },
  { href: "/app/pickup-queue", label: "Pickup queue", icon: Truck, weight: "secondary", tone: "signal" },
  { href: "/app/search", label: "Find cargo", icon: PackageSearch, tone: "info" },
  { href: "/app/inventory", label: "Inventory", icon: Boxes, tone: "violet" },
  { href: "/app/exceptions", label: "Issues & Claims", icon: AlertTriangle, tone: "warning" },
];
// Scanning is deliberately not in this row: it is already the big button in the
// banner directly above, and the same action twice on one screen is the clutter
// the owner asked us to avoid.

async function DarDashboard({
  role,
  userId,
  floor,
  chips,
}: {
  chips: HeroChip[];
  role: "DAR_WAREHOUSE" | "ADMIN";
  userId: string;
  floor: FloorSnapshot;
}) {
  const [stats, alerts, activity, perf, incoming, composition, ageing, throughput] =
    await Promise.all([
    darFloorStats(),
    attentionItems(role),
    recentActivity(8, userId),
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
    floorComposition(),
    floorAgeing(),
    floorFlowByDay(14),
  ]);

  const exceptionParts = [
    stats.missing ? `${stats.missing} missing` : null,
    stats.damaged ? `${stats.damaged} damaged` : null,
    stats.openExceptions - stats.missing - stats.damaged
      ? `${stats.openExceptions - stats.missing - stats.damaged} other`
      : null,
  ].filter(Boolean);

  /**
   * What is waiting on this floor, in the order it costs something.
   *
   * The same band the money desk opens on, in the warehouse's own terms. Every
   * row is a real count with the page that fixes it attached — a warning with
   * nowhere to go is why people stop reading a dashboard.
   */
  const shortBoxes = floor.declaredPackages - floor.packages;
  const notFullyChecked = incoming.filter(
    (b) => b.status === "ARRIVED" && b._count.verifications < b._count.shipments
  ).length;

  const floorJobs: WorkItem[] = [
    {
      when: stats.openExceptions > 0,
      label: `${stats.openExceptions} open ${stats.openExceptions === 1 ? "case" : "cases"}`,
      detail:
        "Cargo reported missing, damaged or wrong on arrival. It cannot be handed over until the case is closed.",
      aside: exceptionParts.join(" · ") || "under investigation",
      href: "/app/exceptions",
      cta: "Work them",
      urgent: true,
    },
    {
      when: shortBoxes > 0,
      label: `${shortBoxes} box${shortBoxes === 1 ? "" : "es"} short of the manifest`,
      detail:
        "Checked in with fewer cartons than the Guangzhou paperwork claims. Every one is either mis-scanned or genuinely missing.",
      href: "/app/receive",
      cta: "Check them in",
      urgent: true,
    },
    {
      when: notFullyChecked > 0,
      label: `${notFullyChecked} landed batch${notFullyChecked === 1 ? "" : "es"} not finished`,
      detail:
        "The plane is down and the manifest is not fully ticked off. Nothing on it can be billed or collected yet.",
      href: "/app/receive",
      cta: "Finish it",
      urgent: true,
    },
    {
      when: floor.aging > 0,
      label: `${floor.aging} past the free storage window`,
      detail: `Standing more than ${STORAGE_POLICY.freeDays} days. Storage is being charged and the customer usually does not know.`,
      aside: `longest ${floor.longestHeldDays} day${floor.longestHeldDays === 1 ? "" : "s"}`,
      href: "/app/inventory",
      cta: "See them",
    },
    {
      when: stats.readyForPickup > 0,
      label: `${stats.readyForPickup} paid, not collected`,
      detail:
        "Cleared by Finance and still on our shelves. The customer can take these away today.",
      aside: `${stats.readyPackages} box(es)`,
      href: "/app/pickup-queue",
      cta: "Hand over",
    },
  ].filter((job) => job.when) as WorkItem[];

  const floorFormat = (n: number) =>
    `${n.toLocaleString("en-US")} consignment${n === 1 ? "" : "s"}`;

  return (
    <div className="space-y-7">
      <ActionPills items={DAR_QUICK_ACTIONS} />

      <FloorChips chips={chips} />

      <div>
        <SectionLabel count={floorJobs.length}>Needs your attention</SectionLabel>
        <WorkList
          items={floorJobs}
          rate={null}
          empty="Nothing is waiting on this floor. Every batch is checked in, nothing is short, and no case is open."
        />
      </div>

      <div>
        <SectionLabel action={{ href: "/app/inventory", label: "The floor" }}>
          The floor, in shape
        </SectionLabel>

        <div className="grid gap-6 xl:grid-cols-[1fr_1.4fr]">
          {/* What the pile is made of. Slices are mutually exclusive and sum to
              the count beside them — see floorComposition; the snapshot's own
              unpaid/cleared/flagged overlap and cannot be drawn as a whole. */}
          <section className="panel p-5">
            <h2 className="font-display font-semibold">What is on the floor</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Every consignment standing in the building, by what is holding it
            </p>
            <div className="mt-4 flex justify-center">
              <Donut
                label={String(composition.total)}
                caption="consignments"
                slices={[
                  { label: "Under investigation", value: composition.flagged, tone: 3 },
                  { label: "Waiting on payment", value: composition.held, tone: 4 },
                  { label: "Cleared, ready to hand over", value: composition.cleared, tone: 5 },
                ]}
              />
            </div>
          </section>

          <div className="space-y-6">
            {/* Boxes arriving against boxes leaving. A floor with 86 standing
                might be busy or seized up, and only the two rates together say
                which. */}
            <section className="panel p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display font-semibold">In and out</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Checked in against handed over, the last fortnight
                  </p>
                </div>
                <p className="text-right text-[11px] text-muted-foreground">
                  <span className="font-mono font-semibold text-success">
                    {throughput.inCounts.reduce((a, b) => a + b, 0)}
                  </span>{" "}
                  in ·{" "}
                  <span className="font-mono font-semibold text-signal">
                    {throughput.outCounts.reduce((a, b) => a + b, 0)}
                  </span>{" "}
                  out
                </p>
              </div>
              <FlowBars
                labels={throughput.labels}
                valuesIn={throughput.inCounts}
                valuesOut={throughput.outCounts}
                currentIndex={throughput.currentIndex}
                format={floorFormat}
                legendIn="Checked in"
                legendOut="Handed over"
              />
            </section>

            {/* How long it has been standing. The storage clock is money
                leaking from a customer who has stopped paying attention. */}
            <section className="panel p-5">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display font-semibold">
                    How long it has been standing
                  </h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Counted from the day it was checked in against a manifest
                  </p>
                </div>
                {floor.longestHeldDays > 0 ? (
                  <p className="text-right text-[11px] text-muted-foreground">
                    longest
                    <span className="ml-1 font-mono font-semibold text-foreground">
                      {floor.longestHeldDays}d
                    </span>
                  </p>
                ) : null}
              </div>
              <AgeingBar
                // Proportioned by boxes, counted in consignments: the bar is
                // the shelf space each age band is eating, the count beside it
                // is how many customers that represents.
                segments={ageing.map((b) => ({
                  key: b.key,
                  label: b.label,
                  count: b.count,
                  value: b.packages,
                }))}
                format={(n) => `${n} box${n === 1 ? "" : "es"}`}
                unit="consignment"
                empty="Nothing is standing on the floor."
              />
            </section>
          </div>
        </div>
      </div>

      {/* The floor, in the five states cargo can be in between the plane and
          the customer.
          "Released today" used to hold the fourth slot and is now a line on
          the pickup card: it is the same shelf, and the number the floor is
          judged on is what is still standing there, not what has gone. The
          slot it freed went to aging stock, which nobody else shows this desk
          and which is the only figure here that costs the customer money. */}
      <div>
        <SectionLabel action={{ href: "/app/inventory", label: "The floor" }}>
          The floor &middot; right now
        </SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          delay={0}
          label="Incoming shipments"
          numeric={stats.incoming}
          hint={
            stats.batchesInAir
              ? `${stats.batchesInAir} batch(es) · ${formatWeight(stats.incomingWeightKg)} in the air`
              : "Nothing in the air from China"
          }
          icon={Plane}
          tone="info"
          href="/app/receive"
        />
        <KpiCard
          delay={1}
          label="Awaiting verification"
          numeric={stats.awaitingVerification}
          hint={
            stats.batchesOnFloor
              ? `${stats.batchesOnFloor} batch(es) landed, not checked in`
              : "Every landed batch is checked in"
          }
          icon={ClipboardCheck}
          tone={stats.awaitingVerification ? "warning" : "success"}
          href="/app/receive"
        />
        <KpiCard
          delay={2}
          label="Ready for pickup"
          numeric={stats.readyForPickup}
          hint={
            stats.readyForPickup
              ? `${stats.readyPackages} box(es) paid for · ${stats.releasedToday} handed over today`
              : `Nothing to collect · ${stats.releasedToday} handed over today`
          }
          icon={Truck}
          tone="success"
          href="/app/pickup-queue"
          ringPct={
            floor.shipments ? (floor.cleared / floor.shipments) * 100 : 0
          }
          ringLabel="Share of held cargo cleared for collection"
        />
        <KpiCard
          delay={3}
          label={`Held over ${STORAGE_POLICY.freeDays} days`}
          numeric={floor.aging}
          hint={
            floor.longestHeldDays > 0
              ? `Longest standing ${floor.longestHeldDays} day(s) · storage is charged after ${STORAGE_POLICY.freeDays}`
              : "Nothing has aged yet"
          }
          icon={Hourglass}
          tone={floor.aging ? "danger" : "success"}
          href="/app/inventory"
        />
        <KpiCard
          delay={4}
          label="Missing or damaged"
          numeric={stats.openExceptions}
          hint={
            exceptionParts.length
              ? exceptionParts.join(" · ")
              : "Nothing flagged on the floor"
          }
          icon={AlertTriangle}
          tone={stats.openExceptions ? "danger" : "success"}
          href="/app/exceptions"
        />
        </div>
      </div>

      <div>
        <SectionLabel>Needs your attention</SectionLabel>
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
      </div>

      {/* Corridor performance is an average, and an average of nothing is not
          a number — it is three em-dashes taking up a third of the screen.
          The panel earns its place once cargo has actually been delivered and
          stays away until then, leaving the activity feed the full width. */}
      <div
        className={
          perf.sample > 0 ? "grid gap-6 lg:grid-cols-[1fr_1.4fr]" : "grid gap-6"
        }
      >
        {perf.sample > 0 ? (
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
        ) : null}

        <ActivityFeed
          entries={activity.map((entry) => ({
            id: entry.id,
            action: entry.action,
            summary: entry.summary,
            createdAt: entry.createdAt,
            actorName: entry.actor?.name ?? entry.actorEmail ?? null,
          }))}
          title="Your activity"
          description="What you have done, newest first"
          showActor={false}
          emptyMessage="Nothing recorded against your account yet."
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Finance — money in, money owed
// ---------------------------------------------------------------------------

/**
 * Finance — what to do today, and what the money is doing.
 *
 * Rebuilt around one fact the old version hid. Every figure on it was a
 * dollar figure, and the two headline tiles read "Outstanding USD 0.00" and
 * "Collection rate 100%" — a business with nothing to chase and a perfect
 * record. Both were true and both were useless: they only ever counted bills
 * that had been RAISED, and 84 consignments worth TSh 25m were sitting in the
 * warehouse priced but unconfirmed, so they had never become bills at all. The
 * one number that mattered was the one number missing.
 *
 * So the page now opens with the work rather than the score. Everything on it
 * is either something to act on — with the money at stake and the link that
 * fixes it — or the position that decision is made against. Nothing is here
 * merely because it could be counted.
 *
 * Shillings lead throughout. Freight is priced in dollars and paid in
 * shillings, and this desk counts shillings.
 */
async function FinanceDashboard({ role }: { role: "FINANCE" | "ADMIN" }) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    stats,
    aging,
    ageing,
    flow,
    alerts,
    revenue,
    rateRow,
    accounts,
    balances,
    drafts,
    unattributed,
    owedOut,
    spent,
  ] = await Promise.all([
    financeStats(),
    agingInWarehouse(6),
    // The two questions a single "collections by month" bar could never
    // answer: how old is what we are owed, and are we keeping any of it.
    receivablesAgeing(),
    cashFlowByMonth(),
    attentionItems(role),
    monthlyRevenue(),
    currentRate(),
    activeAccounts(),
    accountBalances(prisma),
    // The queue the old dashboard had no tile for.
    prisma.invoice.aggregate({
      where: { status: "DRAFT" },
      _count: true,
      _sum: { total: true },
    }),
    // Money we hold that nobody has said where it landed. It is in no account
    // and therefore in no balance, so it can only be seen by asking.
    prisma.payment.aggregate({
      where: { accountId: null },
      _count: true,
      _sum: { creditedAmount: true },
    }),
    prisma.expense.aggregate({
      where: { status: { in: ["PENDING", "APPROVED"] } },
      _count: true,
      _sum: { amountUsd: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { direction: "OUT", occurredAt: { gte: monthStart } },
      _count: true,
      _sum: { amountUsd: true },
    }),
  ]);

  const rate = rateRow ? toNumber(rateRow.rate) : null;
  const tsh = (usd: number) =>
    rate ? `TSh ${Math.round(usd * rate).toLocaleString("en-US")}` : formatUsd(usd);

  const draftValue = toNumber(drafts._sum.total);
  const unattributedUsd = toNumber(unattributed._sum.creditedAmount);
  const owedOutUsd = toNumber(owedOut._sum.amountUsd);
  const spentUsd = toNumber(spent._sum.amountUsd);
  const unsettled = stats.unpaid + stats.partiallyPaid;
  const collectedThisMonth = revenue.values[revenue.values.length - 1] ?? 0;
  const collectedThisYear = revenue.values.reduce((a, b) => a + b, 0);
  const netThisMonth = flow.net[flow.net.length - 1] ?? 0;


  // Cash available: every account's own balance, added up through the dollar
  // so shillings and dollars can share a total. Derived from the ledger, never
  // stored — the same figure the Accounts page shows.
  const byAccount = new Map(balances.map((b) => [b.accountId, b]));
  const accountRows = accounts
    .map((account) => {
      const row = byAccount.get(account.id);
      return {
        ...account,
        native: row ? toNumber(row.inflow) - toNumber(row.outflow) : 0,
        usd: row ? toNumber(row.inflowUsd) - toNumber(row.outflowUsd) : 0,
      };
    })
    .sort((a, b) => b.usd - a.usd);
  const cashUsd = accountRows.reduce((sum, a) => sum + a.usd, 0);
  const holding = accountRows.filter((a) => a.native !== 0).length;

  /**
   * The work, richest first.
   *
   * Each row carries the money at stake and the page that clears it. A queue
   * with no amount beside it cannot be prioritised, and a warning with no link
   * teaches people to scroll past warnings.
   */
  const jobs = [
    {
      when: drafts._count > 0,
      label: `${drafts._count} price${drafts._count === 1 ? "" : "s"} to confirm`,
      detail:
        "Priced automatically at check-in. Nothing can be invoiced, and no cargo released, until you sign them off.",
      usd: draftValue,
      href: "/app/shipments",
      cta: "Review by flight",
      urgent: true,
    },
    {
      when: unattributed._count > 0,
      label: `${unattributed._count} payment${unattributed._count === 1 ? "" : "s"} with no account`,
      detail:
        "Taken from the customer, but nobody said where it landed — so it sits in no account and no balance.",
      usd: unattributedUsd,
      href: "/app/finance/payments",
      cta: "Say where it landed",
      urgent: true,
    },
    {
      when: unsettled > 0,
      label: `${unsettled} bill${unsettled === 1 ? "" : "s"} unpaid`,
      detail: "Confirmed and sent to the customer. The money has not arrived.",
      usd: stats.outstanding,
      href: "/app/collections/follow-up",
      cta: "Chase",
      urgent: false,
    },
    {
      when: owedOut._count > 0,
      label: `${owedOut._count} cost${owedOut._count === 1 ? "" : "s"} to pay out`,
      detail: "Recorded against the business, not yet disbursed from an account.",
      usd: owedOutUsd,
      href: "/app/finance/transactions?kind=EXPENSE",
      cta: "Settle",
      urgent: false,
    },
    {
      when: stats.activeNotes > 0,
      label: `${stats.activeNotes} cleared, not collected`,
      detail:
        "Paid for and released. The cargo is still on our floor waiting for the customer to turn up.",
      aside: "already paid for",
      href: "/app/finance/pickup-notes",
      cta: "See notes",
      urgent: false,
    },
  ].filter((job) => job.when) as WorkItem[];

  /**
   * The handful of things this desk starts many times a day.
   *
   * Pills rather than cards: a toolbar under the numbers, not a second
   * sidebar competing with them. The first two are the jobs — signing off
   * prices and writing down a cost — and the rest are places to look. That
   * split is why the first two are solid and the other four are tinted: six
   * filled colours side by side and nothing leads.
   *
   * Colours are per destination, not per position, and they match the other
   * desks: pickup notes green wherever it appears, anything that means "chase
   * this" amber. A pill that changes colour between screens is not a landmark.
   */
  const shortcuts: ActionPill[] = [
    { href: "/app/shipments", label: "Confirm prices", icon: ClipboardCheck, weight: "primary", tone: "brand" },
    { href: "/app/finance/transactions", label: "Record a cost", icon: Banknote, weight: "secondary", tone: "signal" },
    // Verify payments, not Payments. What Finance starts here is the queue
    // Customer Support hands up — proofs collected at the counter that are
    // worth nothing until this desk agrees with them. The payments list is a
    // record to read, and it is not even in the Finance tab row; this is a
    // job with people waiting on it.
    { href: "/app/finance/verify", label: "Verify payments", icon: ShieldCheck, tone: "info" },
    { href: "/app/finance/pickup-notes", label: "Pickup notes", icon: QrCode, tone: "success" },
    { href: "/app/collections/follow-up", label: "Payment follow-up", icon: Clock, tone: "warning" },
  ];

  return (
    <div className="space-y-7">
      <ActionPills items={shortcuts} />

      {/* ---- The work, before the score ---- */}
      <div>
        {/* The rule above IS this panel's heading. It carried its own <h2>
            reading "What needs you" directly under an eyebrow reading "NEEDS
            YOUR ATTENTION" — one heading printed twice, which reads as two
            things until you work out it is one. */}
        <SectionLabel count={jobs.length}>Needs your attention</SectionLabel>
      <WorkList
        items={jobs}
        rate={rate}
        empty="Nothing is waiting on you. Every price is confirmed, every payment sits in an account, and every bill has been settled."
      />
      </div>

      {/* ---- The position those decisions are made against ---- */}
      <div>
        <SectionLabel action={{ href: "/app/finance", label: "Full position" }}>
          The money · right now
        </SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MoneyTile
          label="Cash available"
          usd={cashUsd}
          rate={rate}
          icon={Wallet}
          tone="good"
          count={`${holding} of ${accountRows.length} accounts holding`}
          hint="Every till and bank account, added up. Comes from the ledger, so it moves the moment money does."
          href="/app/finance/accounts"
        />
        <MoneyTile
          label="Waiting to be billed"
          usd={draftValue}
          rate={rate}
          icon={Hourglass}
          tone="warn"
          emphasis={drafts._count > 0}
          count={`${drafts._count} consignment${drafts._count === 1 ? "" : "s"}`}
          hint="Sitting in the warehouse with a price nobody has confirmed. This is the biggest number on the page for a reason."
          href="/app/shipments"
        />
        <MoneyTile
          label="Owed by customers"
          usd={stats.outstanding}
          rate={rate}
          icon={Clock}
          tone={stats.outstanding > 0 ? "warn" : "default"}
          count={
            unsettled === 0
              ? "nothing outstanding"
              : `${unsettled} bill${unsettled === 1 ? "" : "s"}`
          }
          hint={
            unsettled === 0
              ? "Every bill that has actually been raised is settled. Not the same as everything being billed."
              : "Confirmed, sent, and still unpaid."
          }
          href="/app/collections/follow-up"
        />
        <MoneyTile
          label="Spent this month"
          usd={spentUsd}
          rate={rate}
          icon={TrendingDown}
          tone={spentUsd > 0 ? "bad" : "default"}
          count={
            spent._count === 0
              ? "no costs recorded yet"
              : `${spent._count} payment${spent._count === 1 ? "" : "s"} out`
          }
          hint="Fuel, customs, the clearing agent, rent — what has actually left an account since the 1st."
          href="/app/finance/transactions?direction=OUT&period=month"
        />
        </div>
      </div>

      {/* ---- What it has been doing, and where it is sitting ---- */}
      <div>
        <SectionLabel action={{ href: "/app/finance/transactions", label: "The Ledger" }}>
          Collections &amp; cash
        </SectionLabel>
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <div className="space-y-6">
          {/* Money in and out, one baseline, one scale. */}
          <section className="panel p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display font-semibold">Money in and out</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  What arrived against what it cost, this year
                </p>
              </div>
              <div className="text-right">
                <p
                  className={`font-display text-xl font-bold leading-none tabular ${
                    netThisMonth < 0 ? "text-signal" : "text-success"
                  }`}
                >
                  {netThisMonth < 0 ? "−" : "+"}
                  {tsh(Math.abs(netThisMonth))}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  kept this month · {tsh(collectedThisMonth)} in
                </p>
              </div>
            </div>
            <FlowBars
              labels={flow.labels}
              valuesIn={flow.moneyIn}
              valuesOut={flow.moneyOut}
              currentIndex={flow.currentIndex}
              format={tsh}
            />
          </section>

          {/* How old the debt is — the question "TSh 25m owed" never answers. */}
          <section className="panel p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display font-semibold">
                  What we are owed, by age
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Counted from the day the customer was told, not the day the
                  bill was raised
                </p>
              </div>
              {ageing.oldestDays > 0 ? (
                <p className="text-right text-[11px] text-muted-foreground">
                  oldest
                  <span className="ml-1 font-mono font-semibold text-foreground">
                    {ageing.oldestDays}d
                  </span>
                </p>
              ) : null}
            </div>

            <AgeingBar
              segments={ageing.buckets.map((b) => ({
                key: b.key,
                label: b.label,
                count: b.count,
                value: b.usd,
              }))}
              format={tsh}
              empty="Nothing is owed. Every bill raised has been settled."
            />

          </section>
        </div>

        <section className="panel overflow-hidden">
          <header className="flex items-center justify-between gap-3 border-b px-5 py-3.5">
            <div>
              <h2 className="font-display font-semibold">Where the cash sits</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Each account in its own currency
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/finance/accounts">All accounts</Link>
            </Button>
          </header>
          <ul className="divide-y">
            {accountRows.map((account) => (
              <li
                key={account.id}
                className="flex items-center justify-between gap-3 px-5 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{account.name}</p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {account.kind.replace(/_/g, " ").toLowerCase()}
                  </p>
                </div>
                <p
                  className={`shrink-0 font-mono text-sm font-semibold tabular ${
                    account.native === 0 ? "text-muted-foreground" : ""
                  }`}
                >
                  {formatMoney(account.native, account.currency)}
                </p>
              </li>
            ))}
          </ul>
        </section>
        </div>
      </div>

      {/* ---- The cargo those figures are made of ---- */}
      <div>
        <SectionLabel>Cargo behind the money</SectionLabel>
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="panel overflow-hidden">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
            <div>
              <h2 className="font-display font-semibold">
                Longest in the warehouse
              </h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Oldest arrivals still unpaid — storage is accruing on every one
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/app/collections/follow-up">Payment follow-up</Link>
            </Button>
          </header>

          {aging.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-muted-foreground">
              Nothing to chase.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cargo</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Customer
                    </TableHead>
                    <TableHead className="text-right">Value</TableHead>
                    <TableHead className="text-right">Waiting</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aging.map((shipment) => {
                    const invoice = shipment.invoice;
                    const outstanding = invoice
                      ? toNumber(invoice.total) - toNumber(invoice.amountPaid)
                      : null;
                    // A draft is the system's price, not a bill. Presenting
                    // the two identically has somebody ringing a customer for
                    // a figure this desk has not signed off.
                    const draft = invoice?.status === "DRAFT";
                    return (
                      <TableRow key={shipment.id} className="group">
                        <TableCell className="py-2.5">
                          <Link
                            href={`/app/cargo/${shipment.trackingNumber}`}
                            className="font-mono text-sm font-medium tabular group-hover:text-brand"
                          >
                            {shipment.trackingNumber}
                          </Link>
                          <span className="block truncate text-[11px] text-muted-foreground sm:hidden">
                            {shipment.customer.name}
                          </span>
                        </TableCell>
                        <TableCell className="hidden py-2.5 sm:table-cell">
                          <span className="block truncate text-sm">
                            {shipment.customer.name}
                          </span>
                          <span className="block font-mono text-[11px] text-muted-foreground">
                            {shipment.customer.phone}
                          </span>
                        </TableCell>
                        <TableCell className="py-2.5 text-right">
                          {outstanding === null ? (
                            <span className="text-xs text-muted-foreground">
                              not priced
                            </span>
                          ) : (
                            <>
                              <span className="block text-sm font-semibold tabular">
                                {tsh(outstanding)}
                              </span>
                              <span
                                className={`block text-[11px] ${
                                  draft ? "text-warning" : "text-muted-foreground"
                                }`}
                              >
                                {draft
                                  ? "price not confirmed"
                                  : formatMoney(outstanding, invoice?.currency)}
                              </span>
                            </>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-2.5 text-right text-xs text-muted-foreground">
                          {formatRelative(shipment.arrivedAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </section>

        {/* Cargo problems rather than money problems — a mismatch or a missing
            box becomes a billing argument later, so this desk wants to know
            now. Kept separate from the work list above, which is money only. */}
        <AlertQueue
          items={alerts}
          description="Cargo that needs a call today"
          emptyMessage="No cargo is in trouble."
        />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CEO — the whole business on one screen
// ---------------------------------------------------------------------------

async function ExecutiveDashboard({ role }: { role: "ADMIN" }) {
  const [stats, volume, revenue, perf, alerts, activity, aging, execRateRow] =
    await Promise.all([
    executiveStats(),
    monthlyVolume(),
    monthlyRevenue(),
    corridorPerformance(),
    attentionItems(role),
    recentActivity(10),
    agingInWarehouse(5),
    currentRate(),
  ]);
  const execRate = execRateRow ? toNumber(execRateRow.rate) : null;

  const thisMonthRevenue = revenue.values[revenue.values.length - 1] ?? 0;
  const lastMonthRevenue = revenue.values[revenue.values.length - 2] ?? 0;
  const deliveredShare =
    stats.active + stats.deliveredThisMonth > 0
      ? (stats.deliveredThisMonth / (stats.active + stats.deliveredThisMonth)) * 100
      : 0;

  return (
    <div className="space-y-7">
      <ActionPills
        items={[
          { href: "/app/finance/transactions", label: "The Ledger", icon: Landmark, weight: "primary", tone: "signal" },
          { href: "/app/finance/reports", label: "Profit & loss", icon: TrendingDown, weight: "secondary", tone: "success" },
          { href: "/app/shipments", label: "Shipments", icon: Package, tone: "brand" },
          { href: "/app/batches", label: "Batches", icon: Plane, tone: "violet" },
          { href: "/app/customers", label: "Customers", icon: Users, tone: "info" },
          // Was /app/users, which is not a route -- a 404 on the owner's own
          // dashboard. The page is /app/admin/users, and the sidebar calls it
          // Staff, so this does too.
          { href: "/app/admin/users", label: "Staff", icon: UserCog, tone: "warning" },
        ]}
      />

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

      <div>
        <SectionLabel action={{ href: "/app/finance", label: "Full position" }}>
          Business health &middot; right now
        </SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          delay={0}
          label="Revenue this month"
          numeric={thisMonthRevenue}
          // USD, because that is what the bills are raised in. Payments arrive
          // in either currency and are summed at the rate frozen onto each
          // invoice, so this is one currency, not a mixture wearing a label.
          prefix="USD "
          decimals={2}
          delta={delta(thisMonthRevenue, lastMonthRevenue)}
          hint={`${formatUsd(stats.allTimeCollected)} all time`}
          icon={Banknote}
          tone="success"
          trend={revenue.values}
          href="/app/finance"
        />
        {/* Shillings lead. Freight is priced in dollars and paid in
            shillings, and the owner reads this the way the till does. */}
        <MoneyTile
          label="Outstanding"
          usd={stats.outstanding}
          rate={execRate}
          hint="Owed to us by customers"
          icon={Wallet}
          tone={stats.outstanding > 0 ? "warn" : "good"}
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
      </div>

      <div>
        <SectionLabel>Volume &amp; what needs you</SectionLabel>
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
      </div>

      <div>
        <SectionLabel action={{ href: "/app/finance/transactions", label: "The Ledger" }}>
          Collections &amp; receivables
        </SectionLabel>
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
            formatValue={(n) => formatUsd(n)}
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
                    href={`/app/cargo/${shipment.trackingNumber}`}
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
