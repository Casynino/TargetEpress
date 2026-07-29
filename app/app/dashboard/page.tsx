import Link from "next/link";
import {
  AlertTriangle,
  Banknote,
  Boxes,
  ClipboardCheck,
  Package,
  PackagePlus,
  Plane,
  QrCode,
  ScanLine,
  Truck,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { Button } from "@/components/ui/button";
import { DEFAULT_CURRENCY, ROLE_LABELS } from "@/lib/constants";
import { formatMoney, formatRelative, toNumber } from "@/lib/format";
import {
  agingInWarehouse,
  chinaStats,
  darStats,
  executiveStats,
  financeStats,
  recentActivity,
} from "@/lib/queries";
import { requireUser } from "@/lib/session";

export default async function DashboardPage() {
  const user = await requireUser();

  const greeting = `${user.name.split(" ")[0]} · ${ROLE_LABELS[user.role]}`;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={greeting}
        actions={
          <Button asChild variant="outline" className="rounded-lg">
            <Link href="/app/scan">
              <ScanLine className="mr-2 h-4 w-4" />
              Scan QR
            </Link>
          </Button>
        }
      />

      {user.role === "CHINA_WAREHOUSE" ? <ChinaDashboard /> : null}
      {user.role === "DAR_WAREHOUSE" ? <DarDashboard /> : null}
      {user.role === "FINANCE" ? <FinanceDashboard /> : null}
      {user.role === "ADMIN" ? <ExecutiveDashboard /> : null}
    </>
  );
}

async function ChinaDashboard() {
  const stats = await chinaStats();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Ready to depart"
          value={stats.readyToDepart}
          hint={`${stats.stagedWeightKg.toLocaleString()} kg staged`}
          icon={Package}
          tone="warning"
          href="/app/shipments?status=READY_TO_DEPART"
        />
        <StatCard
          label="Open batches"
          value={stats.openBatches}
          hint="Still accepting cargo"
          icon={Boxes}
          tone="brand"
          href="/app/batches"
        />
        <StatCard
          label="In transit"
          value={stats.inTransitBatches}
          hint="Batches on the way"
          icon={Plane}
          tone="info"
          href="/app/batches?status=IN_TRANSIT"
        />
        <StatCard
          label="Registered this week"
          value={stats.registeredThisWeek}
          icon={PackagePlus}
          tone="success"
        />
      </div>

      <QuickActions
        actions={[
          { href: "/app/shipments/new", label: "Register new cargo", icon: PackagePlus },
          { href: "/app/batches/new", label: "Open a batch", icon: Boxes },
          { href: "/app/batches", label: "Record a departure", icon: Plane },
        ]}
      />

      <ActivityFeed />
    </div>
  );
}

async function DarDashboard() {
  const stats = await darStats();

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Incoming batches"
          value={stats.incoming}
          hint="In the air now"
          icon={Plane}
          tone="info"
          href="/app/receive"
        />
        <StatCard
          label="Awaiting check-in"
          value={stats.awaitingCheck}
          hint="Landed, not verified"
          icon={ClipboardCheck}
          tone="warning"
          href="/app/receive"
        />
        <StatCard
          label="In the warehouse"
          value={stats.inWarehouse}
          hint="Unpaid, holding"
          icon={Warehouse}
          tone="neutral"
          href="/app/shipments?status=RECEIVED_AT_DAR"
        />
        <StatCard
          label="Ready for pickup"
          value={stats.readyForPickup}
          hint="Paid, awaiting collection"
          icon={Truck}
          tone="brand"
          href="/app/release"
        />
        <StatCard
          label="Open exceptions"
          value={stats.openExceptions}
          icon={AlertTriangle}
          tone={stats.openExceptions > 0 ? "danger" : "success"}
          href="/app/exceptions"
        />
      </div>

      <QuickActions
        actions={[
          { href: "/app/receive", label: "Receive a batch", icon: ClipboardCheck },
          { href: "/app/release", label: "Release cargo", icon: Truck },
          { href: "/app/scan", label: "Scan a label", icon: ScanLine },
        ]}
      />

      <ActivityFeed />
    </div>
  );
}

async function FinanceDashboard() {
  const [stats, aging] = await Promise.all([financeStats(), agingInWarehouse()]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Collected"
          value={formatMoney(stats.collected)}
          hint="All time"
          icon={Banknote}
          tone="success"
          href="/app/finance/payments"
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(stats.outstanding)}
          hint={`${stats.unpaid + stats.partiallyPaid} unsettled invoice(s)`}
          icon={Wallet}
          tone={stats.outstanding > 0 ? "warning" : "success"}
          href="/app/finance/invoices"
        />
        <StatCard
          label="Awaiting invoice"
          value={stats.awaitingInvoice}
          hint="Cargo with no bill yet"
          icon={Package}
          tone="brand"
          href="/app/finance/invoices"
        />
        <StatCard
          label="Active pickup notes"
          value={stats.activeNotes}
          hint="Issued, not collected"
          icon={QrCode}
          tone="info"
          href="/app/finance/pickup-notes"
        />
      </div>

      <section className="rounded-xl border bg-card shadow-soft">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="font-display font-semibold">Sitting in the warehouse</h2>
            <p className="text-xs text-muted-foreground">
              Longest-waiting cargo that is still unpaid — chase these first.
            </p>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/app/finance/invoices">All invoices</Link>
          </Button>
        </div>

        {aging.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Nothing waiting"
              description="Every shipment in the warehouse has been settled."
            />
          </div>
        ) : (
          <ul className="divide-y">
            {aging.map((shipment) => {
              const outstanding = shipment.invoice
                ? toNumber(shipment.invoice.total) -
                  toNumber(shipment.invoice.amountPaid)
                : null;
              return (
                <li
                  key={shipment.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/app/shipments/${shipment.id}`}
                      className="font-mono text-sm font-medium tabular hover:text-brand"
                    >
                      {shipment.trackingNumber}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      {shipment.customer.name} · {shipment.customer.phone}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium tabular">
                      {outstanding === null
                        ? "Not invoiced"
                        : formatMoney(
                            outstanding,
                            shipment.invoice?.currency ?? DEFAULT_CURRENCY
                          )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      waiting {formatRelative(shipment.arrivedAt)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <ActivityFeed />
    </div>
  );
}

async function ExecutiveDashboard() {
  const [stats, aging] = await Promise.all([executiveStats(), agingInWarehouse(5)]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Revenue this month"
          value={formatMoney(stats.revenueThisMonth)}
          hint={`${formatMoney(stats.allTimeCollected)} all time`}
          icon={Banknote}
          tone="success"
          href="/app/admin/reports"
        />
        <StatCard
          label="Outstanding"
          value={formatMoney(stats.outstanding)}
          hint="Money owed to us"
          icon={Wallet}
          tone={stats.outstanding > 0 ? "warning" : "success"}
          href="/app/finance/invoices"
        />
        <StatCard
          label="Active shipments"
          value={stats.active}
          hint={`${stats.inTransit} in transit · ${stats.inWarehouse} in Dar`}
          icon={Package}
          tone="brand"
          href="/app/shipments"
        />
        <StatCard
          label="Open exceptions"
          value={stats.openExceptions}
          hint="Needing a decision"
          icon={AlertTriangle}
          tone={stats.openExceptions > 0 ? "danger" : "success"}
          href="/app/exceptions"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Delivered this month"
          value={stats.deliveredThisMonth}
          icon={Truck}
          tone="success"
        />
        <StatCard
          label="Active batches"
          value={stats.activeBatches}
          icon={Boxes}
          tone="info"
          href="/app/batches"
        />
        <StatCard
          label="Customers"
          value={stats.customers}
          icon={Users}
          tone="neutral"
          href="/app/customers"
        />
        <StatCard
          label="Active staff"
          value={stats.staff}
          icon={Users}
          tone="neutral"
          href="/app/admin/users"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card shadow-soft">
          <div className="border-b px-5 py-4">
            <h2 className="font-display font-semibold">Unpaid, in the warehouse</h2>
            <p className="text-xs text-muted-foreground">
              Cargo we are storing but have not been paid for.
            </p>
          </div>
          {aging.length === 0 ? (
            <div className="p-5">
              <EmptyState title="Nothing outstanding in the warehouse" />
            </div>
          ) : (
            <ul className="divide-y">
              {aging.map((shipment) => (
                <li
                  key={shipment.id}
                  className="flex items-center justify-between gap-3 px-5 py-3"
                >
                  <Link
                    href={`/app/shipments/${shipment.id}`}
                    className="font-mono text-sm tabular hover:text-brand"
                  >
                    {shipment.trackingNumber}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {formatRelative(shipment.arrivedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <ActivityFeed />
      </div>
    </div>
  );
}

function QuickActions({
  actions,
}: {
  actions: { href: string; label: string; icon: typeof Package }[];
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {actions.map(({ href, label, icon: Icon }) => (
        <Link
          key={href}
          href={href}
          className="flex items-center gap-3 rounded-xl border bg-card p-4 shadow-soft transition-shadow hover:shadow-lift"
        >
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
            <Icon className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium">{label}</span>
        </Link>
      ))}
    </div>
  );
}

async function ActivityFeed() {
  const entries = await recentActivity(10);

  return (
    <section className="rounded-xl border bg-card shadow-soft">
      <div className="border-b px-5 py-4">
        <h2 className="font-display font-semibold">Recent activity</h2>
        <p className="text-xs text-muted-foreground">
          Everything the team has done, newest first.
        </p>
      </div>
      {entries.length === 0 ? (
        <div className="p-5">
          <EmptyState title="No activity yet" />
        </div>
      ) : (
        <ul className="divide-y">
          {entries.map((entry) => (
            <li key={entry.id} className="px-5 py-3">
              <p className="text-sm">{entry.summary}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {entry.actor?.name ?? entry.actorEmail ?? "System"} ·{" "}
                {formatRelative(entry.createdAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
