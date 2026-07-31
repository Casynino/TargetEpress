import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CircleAlert,
  Info,
  type LucideIcon,
} from "lucide-react";

import type {
  ActiveStaff,
  FeedEntry,
  Insight,
  LoadingTable,
  ProgressLine,
  WarehouseAlert,
} from "@/lib/warehouse-home";
import { cn } from "@/lib/utils";

/**
 * The panels that make up the warehouse home.
 *
 * Server components, all of them — nothing here needs to react to a click, and
 * a dashboard that ships no JavaScript loads instantly on the shared tablet by
 * the counter, which is where it is mostly read.
 */

export function QuickAction({
  href,
  icon: Icon,
  label,
  hint,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  hint: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-soft transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift motion-reduce:hover:translate-y-0"
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand transition-colors group-hover:bg-brand group-hover:text-brand-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
      </span>
    </Link>
  );
}

/** One of the two permanent loading tables, with its way in. */
export function LoadingTableCard({ table }: { table: LoadingTable }) {
  const percent = Math.round(table.readiness * 100);

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-bold leading-tight">
            {table.title}
          </h3>
          <p className="text-xs text-muted-foreground">{table.carries}</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[11px] font-medium tabular">
          {table.batchNumber}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {[
          { label: "Shipments", value: String(table.shipments) },
          { label: "Packages", value: String(table.packages) },
          { label: "Weight", value: `${table.weightKg.toFixed(1)} kg` },
          { label: "Customers", value: String(table.customers) },
        ].map((item) => (
          <div key={item.label} className="bg-card p-4">
            <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
            <dd className="mt-1 font-display text-lg font-bold tabular">
              {item.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Readiness, not fullness. A table can be full of cargo that cannot fly
          because half of it has no weight on it. */}
      <div className="px-5 py-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">Ready to fly</span>
          <span className="tabular text-muted-foreground">{percent}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              percent >= 90
                ? "bg-success"
                : percent >= 60
                  ? "bg-brand"
                  : "bg-warning"
            )}
            style={{ width: `${Math.max(percent, 2)}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Photographed, weighed and classified
          {table.lastUpdatedLabel ? ` · updated ${table.lastUpdatedLabel}` : ""}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-t px-5 py-3">
        <Link
          href={`/app/batches/${table.id}`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-2 text-xs font-medium text-background transition-opacity hover:opacity-90"
        >
          Open batch
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/app/cargo/new"
          className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-accent"
        >
          Register cargo
        </Link>
        <Link
          href={`/app/batches/${table.id}/manifest`}
          className="rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-accent"
        >
          View manifest
        </Link>
      </div>
    </section>
  );
}

export function TodayProgress({ lines }: { lines: ProgressLine[] }) {
  return (
    <section className="panel">
      <div className="border-b px-5 py-4">
        <h2 className="font-display font-semibold">Today&apos;s progress</h2>
        <p className="text-xs text-muted-foreground">
          How much of what you took in today is finished
        </p>
      </div>
      <div className="space-y-4 p-5">
        {lines.map((line) => {
          const percent =
            line.total === 0 ? 0 : Math.round((line.done / line.total) * 100);
          return (
            <div key={line.label}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{line.label}</span>
                <span className="text-xs text-muted-foreground tabular">
                  {line.done} / {line.total}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    percent === 100 ? "bg-success" : "bg-brand"
                  )}
                  style={{ width: `${percent}%` }}
                />
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{line.hint}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function WarehouseFeed({ entries }: { entries: FeedEntry[] }) {
  return (
    <section className="panel">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <h2 className="font-display font-semibold">Warehouse feed</h2>
          <p className="text-xs text-muted-foreground">
            What everyone is doing
          </p>
        </div>
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
          Live
        </span>
      </div>
      {entries.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">
          Nothing has happened yet today.
        </p>
      ) : (
        <ol className="divide-y">
          {entries.map((entry) => {
            const body = (
              <div className="flex gap-4">
                <span className="w-12 shrink-0 text-xs text-muted-foreground tabular">
                  {entry.timeLabel}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm">
                    <span className="font-medium">{entry.actor}</span>{" "}
                    <span className="text-muted-foreground">{entry.summary}</span>
                  </span>
                </span>
              </div>
            );
            return (
              <li key={entry.id}>
                {entry.href ? (
                  <Link
                    href={entry.href}
                    className="block px-5 py-3 transition-colors hover:bg-accent"
                  >
                    {body}
                  </Link>
                ) : (
                  <div className="px-5 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function WarehouseInsights({ insights }: { insights: Insight[] }) {
  return (
    <section className="panel">
      <div className="border-b px-5 py-4">
        <h2 className="font-display font-semibold">Today&apos;s cargo, in short</h2>
      </div>
      <dl className="divide-y">
        {insights.map((insight) => (
          <div
            key={insight.label}
            className="flex items-baseline justify-between gap-4 px-5 py-3"
          >
            <dt className="text-xs text-muted-foreground">{insight.label}</dt>
            <dd className="text-right text-sm font-medium">{insight.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const ALERT_STYLES = {
  block: {
    icon: CircleAlert,
    wrap: "border-destructive/30 bg-destructive/5",
    text: "text-destructive",
  },
  warn: {
    icon: AlertTriangle,
    wrap: "border-warning/30 bg-warning/5",
    text: "text-warning",
  },
  info: { icon: Info, wrap: "border-info/30 bg-info/5", text: "text-info" },
} as const;

export function WarehouseAlerts({ alerts }: { alerts: WarehouseAlert[] }) {
  return (
    <section className="panel">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="font-display font-semibold">Needs fixing</h2>
        {alerts.length > 0 ? (
          <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[11px] font-semibold text-warning tabular">
            {alerts.length}
          </span>
        ) : null}
      </div>
      {alerts.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">
          Nothing outstanding. Every piece on the floor has a photo, a weight and
          an item.
        </p>
      ) : (
        <ul className="space-y-3 p-4">
          {alerts.map((alert) => {
            const style = ALERT_STYLES[alert.tone];
            const Icon = style.icon;
            return (
              <li key={alert.id}>
                <Link
                  href={alert.href}
                  className={cn(
                    "flex gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50",
                    style.wrap
                  )}
                >
                  <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", style.text)} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">
                      {alert.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {alert.detail}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function StaffOnFloor({ staff }: { staff: ActiveStaff[] }) {
  const online = staff.filter((s) => s.online).length;

  return (
    <section className="panel">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <h2 className="font-display font-semibold">On the floor</h2>
        <span className="text-xs text-muted-foreground tabular">
          {online} online
        </span>
      </div>
      <ul className="divide-y">
        {staff.map((person) => (
          <li key={person.id} className="flex items-center gap-3 px-5 py-3">
            <span className="relative shrink-0">
              {person.photoUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={person.photoUrl}
                  alt=""
                  className="h-8 w-8 rounded-full border object-cover"
                />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                  {person.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span
                className={cn(
                  "absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card",
                  person.online ? "bg-success" : "bg-muted-foreground/40"
                )}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {person.name}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {person.online ? "Online now" : `Last seen ${person.lastSeenLabel}`}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
