import Link from "next/link";
import {
  Boxes,
  ClipboardList,
  FileText,
  PackagePlus,
  Plane,
  Printer,
  QrCode,
  ScanLine,
  Search,
  Users,
} from "lucide-react";

import { WarehouseHero } from "@/components/app/warehouse-hero";
import {
  LoadingTableCard,
  QuickAction,
  StaffOnFloor,
  TodayProgress,
  WarehouseAlerts,
  WarehouseFeed,
  WarehouseInsights,
} from "@/components/app/warehouse-panels";
import { formatDate } from "@/lib/format";
import {
  activeStaff,
  latestArrivals,
  loadingTables,
  nextDeparture,
  todayProgress,
  todaySummary,
  warehouseAlerts,
  warehouseFeed,
  warehouseInsights,
} from "@/lib/warehouse-home";
import { profileStats } from "@/lib/profile";

/**
 * The warehouse command centre.
 *
 * Ordered by what someone standing at the counter needs, in the order they
 * need it: how today is going, which table to put the next carton on, the
 * actions they take twenty times a shift, then what is left to finish, then
 * what everyone else is doing, and last what is wrong.
 *
 * The two loading tables sit high and stay there. They are not a report — they
 * are the two physical places cargo goes, and every shift is spent filling
 * one of them.
 */
export async function WarehouseHome({
  firstName,
  department,
  side,
}: {
  firstName: string;
  department: string;
  /** Which country the reader is standing in — decides the emphasised clock. */
  side: "CN" | "TZ";
}) {
  const [
    summary,
    tables,
    progress,
    feed,
    insights,
    alerts,
    staff,
    departure,
    arrivals,
  ] = await Promise.all([
    todaySummary(),
    loadingTables(),
    todayProgress(),
    warehouseFeed(10),
    warehouseInsights(),
    warehouseAlerts(),
    activeStaff(department),
    nextDeparture(),
    latestArrivals(5),
  ]);

  // The greeting follows the warehouse's own clock, not the server's.
  const hourOfDay = Number(
    new Date().toLocaleString("en-GB", {
      timeZone: side === "CN" ? "Asia/Shanghai" : "Africa/Dar_es_Salaam",
      hour: "2-digit",
      hour12: false,
    })
  );

  const warehouseName =
    side === "CN" ? "China Warehouse" : "Dar es Salaam Warehouse";

  return (
    <>
      <WarehouseHero
        firstName={firstName}
        warehouseName={warehouseName}
        emphasis={side}
        summary={summary}
        hourOfDay={Number.isNaN(hourOfDay) ? 9 : hourOfDay}
      />

      {/* The two tables, first and largest. */}
      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        {tables.map((table) => (
          <LoadingTableCard key={table.id} table={table} />
        ))}
      </div>

      <section className="mb-6">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Quick actions
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <QuickAction
            href="/app/cargo/new"
            icon={PackagePlus}
            label="Register cargo"
            hint="Take in a new piece"
          />
          <QuickAction
            href="/app/scan"
            icon={ScanLine}
            label="Scan QR"
            hint="Read a package label"
          />
          {tables[0] ? (
            <QuickAction
              href={`/app/batches/${tables[0].id}/stickers`}
              icon={Printer}
              label="Print labels"
              hint={`Everything on ${tables[0].batchNumber}`}
            />
          ) : null}
          <QuickAction
            href="/app/customers"
            icon={Users}
            label="Customers"
            hint="Find or add a customer"
          />
          <QuickAction
            href="/app/batches"
            icon={Boxes}
            label="Both batches"
            hint="Guangzhou and Hong Kong"
          />
          <QuickAction
            href="/app/shipments"
            icon={Plane}
            label="Dispatched"
            hint="What has already flown"
          />
          {tables[0] ? (
            <QuickAction
              href={`/app/batches/${tables[0].id}/manifest`}
              icon={FileText}
              label="Manifest"
              hint={tables[0].title}
            />
          ) : null}
          {tables[1] ? (
            <QuickAction
              href={`/app/batches/${tables[1].id}/manifest`}
              icon={ClipboardList}
              label="Manifest"
              hint={tables[1].title}
            />
          ) : null}
          <QuickAction
            href="/app/profile/shipments"
            icon={Search}
            label="My shipments"
            hint="Everything you registered"
          />
          <QuickAction
            href="/app/profile"
            icon={QrCode}
            label="My activity"
            hint="Your work, day by day"
          />
        </div>
      </section>

      <div className="mb-6 grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <TodayProgress lines={progress} />
          <WarehouseFeed entries={feed} />
        </div>

        <div className="space-y-6">
          <WarehouseAlerts alerts={alerts} />

          {/* Real flight information, from the last batch that was dispatched.
              There is no weather here: it would mean calling an outside service
              from a warehouse tablet, and nobody loads a cargo system to find
              out whether it is raining. */}
          {departure ? (
            <section className="panel">
              <div className="border-b px-5 py-4">
                <h2 className="font-display font-semibold">Latest flight</h2>
                <p className="text-xs text-muted-foreground">
                  {departure.batchNumber} · {departure._count.shipments} pieces
                </p>
              </div>
              <dl className="divide-y text-sm">
                {[
                  {
                    label: "Airline / flight",
                    value:
                      `${departure.airline ?? "—"} ${departure.flightNumber ?? ""}`.trim(),
                  },
                  { label: "Waybill", value: departure.waybillNumber ?? "—" },
                  { label: "Departed", value: formatDate(departure.departureDate) },
                  {
                    label: "Expected in Dar",
                    value: formatDate(departure.expectedArrival),
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-baseline justify-between gap-4 px-5 py-3"
                  >
                    <dt className="text-xs text-muted-foreground">{row.label}</dt>
                    <dd className="text-right font-medium">{row.value}</dd>
                  </div>
                ))}
              </dl>
              <div className="border-t px-5 py-3">
                <Link
                  href={`/app/shipments/${departure.id}`}
                  className="text-xs font-medium text-brand hover:underline"
                >
                  Open shipment →
                </Link>
              </div>
            </section>
          ) : null}

          <StaffOnFloor staff={staff} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <WarehouseInsights insights={insights} />

        <section className="panel">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="font-display font-semibold">Just taken in</h2>
            <Link
              href="/app/profile/shipments"
              className="text-xs font-medium text-brand hover:underline"
            >
              Mine
            </Link>
          </div>
          {arrivals.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">
              Nothing registered yet.
            </p>
          ) : (
            <ul className="divide-y">
              {arrivals.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/app/cargo/${row.trackingNumber}`}
                    className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-accent"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-xs font-semibold tabular">
                        {row.trackingNumber}
                      </span>
                      <span className="block truncate text-sm">
                        {row.customerName} · {row.item}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs text-muted-foreground">
                      <span className="block tabular">
                        {row.weightKg.toFixed(1)} kg
                      </span>
                      <span className="block">{row.atLabel}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}

/** The signed-in person's own numbers, for the top of their feed column. */
export async function MyDayPanel({ userId }: { userId: string }) {
  const stats = await profileStats(userId);

  return (
    <section className="panel">
      <div className="border-b px-5 py-4">
        <h2 className="font-display font-semibold">Your work today</h2>
      </div>
      <dl className="grid grid-cols-2 gap-px bg-border">
        {[
          { label: "Registered", value: String(stats.todayShipments) },
          { label: "Weight", value: `${stats.todayWeightKg.toFixed(1)} kg` },
          { label: "Labels printed", value: String(stats.labelsPrinted) },
          { label: "Batches", value: String(stats.batchesTouched) },
        ].map((item) => (
          <div key={item.label} className="bg-card p-4">
            <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
            <dd className="mt-1 font-display text-lg font-bold tabular">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-t px-5 py-3">
        <Link
          href="/app/profile"
          className="text-xs font-medium text-brand hover:underline"
        >
          Your full profile →
        </Link>
      </div>
    </section>
  );
}
