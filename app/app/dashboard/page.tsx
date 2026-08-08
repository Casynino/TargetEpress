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
import { AttentionCenter, type AttnItem } from "@/components/app/attention-center";
import { KpiCard } from "@/components/app/kpi-card";
import { PageHeader } from "@/components/app/page-header";
import { SectionLabel } from "@/components/app/section-label";
import { StatStrip } from "@/components/app/stat-strip";
import { AreaChart } from "@/components/charts/area-chart";
import { AgeingBar } from "@/components/charts/ageing-bar";
import { Donut, DonutLegend, SWATCHES } from "@/components/charts/donut";
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
  chinaAgeing,
  chinaComposition,
  chinaFlowByDay,
  chinaProblems,
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
  const [
    stats,
    volume,
    utilisation,
    mix,
    activity,
    openBatches,
    composition,
    ageing,
    throughput,
    problems,
  ] = await Promise.all([
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
    chinaComposition(),
    chinaAgeing(),
    chinaFlowByDay(14),
    chinaProblems(),
  ]);

  /**
   * What is wrong on this floor, in the words of the desk that registers cargo.
   *
   * The same panel Dar and the money desk use, with China's own failures in it:
   * registering is this desk's whole job, so every row is a way that job is
   * incomplete.
   */
  const attention: AttnItem[] = [
    {
      when: problems.noPhotos > 0,
      id: "no-photos",
      group: "Registration",
      severity: "critical" as const,
      label: `${problems.noPhotos} consignment${problems.noPhotos === 1 ? "" : "s"} with no photograph`,
      detail:
        "Nothing to show the customer if it arrives damaged, and nothing to argue with when they say it did.",
      href: "/app/shipments",
    },
    {
      when: problems.unassigned > 0,
      id: "unassigned",
      group: "Loading",
      severity: "critical" as const,
      label: `${problems.unassigned} on no batch`,
      detail:
        "Registered and sitting loose. Cargo on no batch does not get on an aircraft.",
      href: "/app/batches",
    },
    {
      when: problems.staleBatches > 0,
      id: "stale-batches",
      group: "Loading",
      severity: "warning" as const,
      label: `${problems.staleBatches} batch${problems.staleBatches === 1 ? "" : "es"} open more than ${problems.staleDays} days`,
      detail:
        "A batch left open stops being a batch and becomes a shelf. Seal it or fly it.",
      href: "/app/batches",
    },
    {
      when: problems.waiting > 0,
      id: "waiting",
      group: "Waiting",
      severity: "info" as const,
      label: `${problems.waiting} waiting more than ${problems.staleDays} days`,
      detail:
        "Booked in and still in Guangzhou. Every day here is a day the customer is counting.",
      href: "/app/shipments",
      value: `${stats.stagedWeightKg.toFixed(0)} kg`,
    },
  ].filter((job) => job.when) as AttnItem[];

  const chinaFormat = (n: number) =>
    `${n.toLocaleString("en-US")} consignment${n === 1 ? "" : "s"}`;

  // One array for the ring and its key, so the two cannot be relabelled apart.
  const chinaSlices = [
    { label: "On no batch", value: composition.unassigned, tone: 3 as const },
    { label: "Loading", value: composition.loading, tone: 4 as const },
    { label: "Sealed, ready to fly", value: composition.sealed, tone: 5 as const },
  ];

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

      {/* No StatStrip here. FloorChips above already carries this desk's
          standing numbers, and the same figures twice a centimetre apart is the
          duplication every other dashboard in this app has had removed. */}
      <AttentionCenter
        items={attention}
        reviewAll={{ href: "/app/shipments", label: "All cargo" }}
        empty="Nothing is waiting on this desk. Every consignment is photographed, on a batch, and moving."
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

      {/* The same three questions the Dar floor asks, in Guangzhou's terms. */}
      <div>
        <SectionLabel action={{ href: "/app/shipments", label: "All cargo" }}>
          The desk, in shape
        </SectionLabel>
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="panel p-4">
            <h3 className="text-sm font-semibold">What is in Guangzhou</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              By what is holding each consignment
            </p>
            <div className="mt-3 flex justify-center">
              <Donut
                size={118}
                stroke={18}
                label={String(composition.total)}
                caption="consignments"
                slices={chinaSlices}
              />
            </div>
            <DonutLegend className="mt-3" slices={chinaSlices} />
          </section>

          <section className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">In and out</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Registered against flown, a fortnight
                </p>
              </div>
              <p className="shrink-0 text-right text-[11px] text-muted-foreground">
                <span className="font-mono font-semibold text-success">
                  {throughput.inCounts.reduce((x, y) => x + y, 0)}
                </span>
                {" / "}
                <span className="font-mono font-semibold text-signal">
                  {throughput.outCounts.reduce((x, y) => x + y, 0)}
                </span>
              </p>
            </div>
            <FlowBars
              className="mt-3"
              labels={throughput.labels}
              valuesIn={throughput.inCounts}
              valuesOut={throughput.outCounts}
              currentIndex={throughput.currentIndex}
              format={chinaFormat}
              legendIn="Registered"
              legendOut="Flown"
            />
          </section>

          <section className="panel p-4">
            <h3 className="text-sm font-semibold">How long it has waited</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              From the day it was registered in Guangzhou
            </p>
            <AgeingBar
              className="mt-3"
              segments={ageing.map((bucket) => ({
                key: bucket.key,
                label: bucket.label,
                count: bucket.count,
                value: bucket.packages,
              }))}
              format={(n) => `${n} box${n === 1 ? "" : "es"}`}
              unit="consignment"
              empty="Nothing is waiting in Guangzhou."
            />
          </section>
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

  /**
   * Everything waiting on this floor, as one list.
   *
   * Aggregates and specifics in the same panel, and never both for one thing:
   * the open cases arrive as named consignments from attentionItems, so there
   * is deliberately no "3 open cases" row counting them again. The rest are
   * floor-wide conditions with no single tracking number to point at.
   */
  const GROUP_BY_PREFIX: Record<string, string> = {
    exc: "Cases",
    batch: "Receiving",
    open: "Receiving",
    noinv: "Billing",
    unpaid: "Billing",
    note: "Pickup",
  };

  const attention: AttnItem[] = [
    ...alerts.map((alert) => ({
      id: alert.id,
      group: GROUP_BY_PREFIX[alert.id.split("-")[0]] ?? "Other",
      severity: alert.severity,
      label: alert.title,
      detail: alert.detail,
      href: alert.href ?? "/app/exceptions",
      value: alert.meta,
    })),
    ...([
      {
        when: shortBoxes > 0,
        id: "short-boxes",
        group: "Receiving",
        severity: "critical" as const,
        label: `${shortBoxes} box${shortBoxes === 1 ? "" : "es"} short of the manifest`,
        detail:
          "Checked in with fewer cartons than the Guangzhou paperwork claims — mis-scanned, or genuinely missing.",
        href: "/app/receive",
      },
      {
        when: floor.aging > 0,
        id: "aging",
        group: "Storage",
        severity: "warning" as const,
        label: `${floor.aging} past the free storage window`,
        detail: `Standing more than ${STORAGE_POLICY.freeDays} days. Storage is being charged and the customer usually does not know.`,
        href: "/app/inventory",
        value: `longest ${floor.longestHeldDays}d`,
      },
      {
        when: stats.readyForPickup > 0,
        id: "ready",
        group: "Pickup",
        severity: "info" as const,
        label: `${stats.readyForPickup} paid, not collected`,
        detail:
          "Cleared by Finance and still on our shelves. The customer can take these away today.",
        href: "/app/pickup-queue",
        value: `${stats.readyPackages} box(es)`,
      },
    ].filter((job) => job.when) as AttnItem[]),
  ];

  // One array for the ring and its legend — two lists would be two chances to
  // relabel one and not the other.
  const floorSlices = [
    { label: "Under investigation", value: composition.flagged, tone: 3 as const },
    { label: "Waiting on payment", value: composition.held, tone: 4 as const },
    { label: "Cleared, ready to go", value: composition.cleared, tone: 5 as const },
  ];

  const floorFormat = (n: number) =>
    `${n.toLocaleString("en-US")} consignment${n === 1 ? "" : "s"}`;

  return (
    <div className="space-y-7">
      <ActionPills items={DAR_QUICK_ACTIONS} />

      <FloorChips chips={chips} />

      <AttentionCenter
        items={attention}
        reviewAll={{ href: "/app/exceptions" }}
        empty="Nothing is waiting on this floor. Every batch is checked in, nothing is short, and no case is open."
      />

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
        <SectionLabel action={{ href: "/app/inventory", label: "The floor" }}>
          The floor, in shape
        </SectionLabel>

        {/* Three across, not a tall two-column split. The donut card was
            stretched to the height of two stacked cards beside it and stood
            almost empty — the chart band was taller than the work it was
            meant to sit under. */}
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="panel p-4">
            <h3 className="text-sm font-semibold">What is on the floor</h3>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              By what is holding each consignment
            </p>
            <div className="mt-3 flex justify-center">
              <Donut
                size={118}
                stroke={18}
                label={String(composition.total)}
                caption="consignments"
                slices={floorSlices}
              />
            </div>
            {/* The ring was drawn without a key: three colours and no way to
                learn what any of them meant. */}
            <DonutLegend className="mt-3" slices={floorSlices} />
          </section>

          <section className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">In and out</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Checked in against handed over, a fortnight
                </p>
              </div>
              <p className="shrink-0 text-right text-[11px] text-muted-foreground">
                <span className="font-mono font-semibold text-success">
                  {throughput.inCounts.reduce((a, b) => a + b, 0)}
                </span>
                {" / "}
                <span className="font-mono font-semibold text-signal">
                  {throughput.outCounts.reduce((a, b) => a + b, 0)}
                </span>
              </p>
            </div>
            <FlowBars
              className="mt-3"
              labels={throughput.labels}
              valuesIn={throughput.inCounts}
              valuesOut={throughput.outCounts}
              currentIndex={throughput.currentIndex}
              format={floorFormat}
              legendIn="Checked in"
              legendOut="Handed over"
            />
          </section>

          <section className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">How long it has stood</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  From the day it was checked in
                </p>
              </div>
              {floor.longestHeldDays > 0 ? (
                <p className="shrink-0 text-right text-[11px] text-muted-foreground">
                  longest{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {floor.longestHeldDays}d
                  </span>
                </p>
              ) : null}
            </div>
            <AgeingBar
              className="mt-3"
              // Proportioned by boxes, counted in consignments: the bar is the
              // shelf space each age band eats, the count beside it is how many
              // customers that represents.
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

      {/* No second attention panel. Every case it listed is now an AttnItem in
          the band above — which is the point of that band: one place, one
          heading, one count that can be trusted. */}
      <div>
        <SectionLabel>Inbound</SectionLabel>
        <div className="grid gap-6">
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
   * The cash ring and its key, from one array.
   *
   * Proportioned by the dollar figure because six accounts in two currencies
   * cannot share a ring otherwise; the key shows each balance in the currency
   * the account is actually held in, which is what the old list did and the
   * only reason it was worth its own panel.
   */
  const cashLegend = accountRows.slice(0, 6);
  const cashSlices = cashLegend.map((account, i) => ({
    label: account.name,
    value: Math.max(0, account.usd),
    tone: ((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6,
  }));

  /**
   * The work, richest first.
   *
   * Each row carries the money at stake and the page that clears it. A queue
   * with no amount beside it cannot be prioritised, and a warning with no link
   * teaches people to scroll past warnings.
   */
  const jobs = [
    {
      group: "Pricing",
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
      group: "Payments",
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
      group: "Collections",
      when: unsettled > 0,
      label: `${unsettled} bill${unsettled === 1 ? "" : "s"} unpaid`,
      detail: "Confirmed and sent to the customer. The money has not arrived.",
      usd: stats.outstanding,
      href: "/app/collections/follow-up",
      cta: "Chase",
      urgent: false,
    },
    {
      group: "Costs",
      when: owedOut._count > 0,
      label: `${owedOut._count} cost${owedOut._count === 1 ? "" : "s"} to pay out`,
      detail: "Recorded against the business, not yet disbursed from an account.",
      usd: owedOutUsd,
      href: "/app/finance/transactions?kind=EXPENSE",
      cta: "Settle",
      urgent: false,
    },
    {
      group: "Pickup",
      when: stats.activeNotes > 0,
      label: `${stats.activeNotes} cleared, not collected`,
      detail:
        "Paid for and released. The cargo is still on our floor waiting for the customer to turn up.",
      aside: "already paid for",
      href: "/app/finance/pickup-notes",
      cta: "See notes",
      urgent: false,
    },
  ].filter((job) => job.when);

  /**
   * The money jobs and the cargo problems, in one panel.
   *
   * They were two — a work band and a separate "cargo that needs a call today"
   * list — under two headings that both meant "look here". A mismatch or a
   * missing box IS a money problem to this desk; it becomes a billing argument
   * a fortnight later, which is the reason that second list was put on the page
   * in the first place. So it is a pill, not a panel.
   */
  const financeAttention: AttnItem[] = [
    ...jobs.map((job) => ({
      id: job.href + job.label,
      group: job.group,
      severity: (job.urgent ? "critical" : "info") as AttnItem["severity"],
      label: job.label,
      detail: job.detail,
      href: job.href,
      value: job.usd !== undefined ? tsh(job.usd) : job.aside,
      valueSub: job.usd !== undefined ? formatUsd(job.usd) : undefined,
    })),
    ...alerts.map((alert) => ({
      id: alert.id,
      group: "Cargo",
      severity: alert.severity,
      label: alert.title,
      detail: alert.detail,
      href: alert.href ?? "/app/exceptions",
      value: alert.meta,
    })),
  ];

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
      <AttentionCenter
          items={financeAttention}
          reviewAll={{ href: "/app/collections/follow-up", label: "The call list" }}
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
      {/*
        Three questions about the money, three cards, one row.

        It used to be a 1.6fr/1fr split with two charts stacked in the wide
        column and the account list running down the narrow one — so the band
        was as tall as two cards and the list dictated the height of everything
        beside it.
      */}
      <div>
        <SectionLabel action={{ href: "/app/finance/transactions", label: "The Ledger" }}>
          The money, in shape
        </SectionLabel>

        <div className="grid gap-4 lg:grid-cols-3">
          {/* The account list becomes the key to a ring rather than a panel of
              its own. Proportioned by each account's dollar figure — the same
              basis "Cash available" is computed on, so no new conversion is
              invented here — while the legend keeps every balance in the
              currency the account is actually held in. */}
          <section className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Where the cash sits</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {holding} of {accountRows.length} accounts holding
                </p>
              </div>
              <Link
                href="/app/finance/accounts"
                className="focus-ring shrink-0 rounded text-[11px] font-semibold text-brand hover:underline"
              >
                All
              </Link>
            </div>

            {cashUsd > 0 ? (
              <>
                <div className="mt-3 flex justify-center">
                  <Donut
                    size={118}
                    stroke={18}
                    label={tsh(cashUsd).replace("TSh ", "")}
                    caption="TSh in hand"
                    slices={cashSlices}
                  />
                </div>
                <ul className="mt-3 space-y-1.5">
                  {cashSlices.map((slice, i) => (
                    <li key={slice.label} className="flex items-center gap-2 text-xs">
                      <span
                        aria-hidden
                        className={`h-2 w-2 shrink-0 rounded-sm ${SWATCHES[slice.tone]}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">
                        {slice.label}
                      </span>
                      <span className="shrink-0 font-mono font-semibold tabular-nums">
                        {formatMoney(cashLegend[i].native, cashLegend[i].currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                Every account is empty.
              </p>
            )}
          </section>

          <section className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">Money in and out</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  What arrived against what it cost, this year
                </p>
              </div>
              <p
                className={`shrink-0 text-right font-mono text-[11px] font-semibold ${
                  netThisMonth < 0 ? "text-signal" : "text-success"
                }`}
              >
                {netThisMonth < 0 ? "−" : "+"}
                {tsh(Math.abs(netThisMonth))}
              </p>
            </div>
            <FlowBars
              className="mt-3"
              labels={flow.labels}
              valuesIn={flow.moneyIn}
              valuesOut={flow.moneyOut}
              currentIndex={flow.currentIndex}
              format={tsh}
            />
          </section>

          <section className="panel p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold">What we are owed, by age</h3>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  From the day the bill became real
                </p>
              </div>
              {ageing.oldestDays > 0 ? (
                <p className="shrink-0 text-right text-[11px] text-muted-foreground">
                  oldest{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {ageing.oldestDays}d
                  </span>
                </p>
              ) : null}
            </div>
            <AgeingBar
              className="mt-3"
              segments={ageing.buckets.map((bucket) => ({
                key: bucket.key,
                label: bucket.label,
                count: bucket.count,
                value: bucket.usd,
              }))}
              format={tsh}
              empty="Nothing is owed. Every bill raised has been settled."
            />
          </section>
        </div>
      </div>

      {/* ---- The cargo those figures are made of ---- */}
      <div>
        <SectionLabel>Cargo behind the money</SectionLabel>
        {/* One child, so no grid. It was in a 1.6fr/1fr split with nothing in
            the second column — the table was squeezed into two thirds of the
            row and the rest was blank. */}
        <div>
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
