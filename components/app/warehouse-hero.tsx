import Link from "next/link";
import { Package, PackagePlus, Printer, Scale } from "lucide-react";

import { DualClock } from "@/components/app/dual-clock";
import type { TodaySummary } from "@/lib/warehouse-home";

/**
 * The first thing the warehouse sees.
 *
 * A greeting, the time in both countries, and today's three numbers. It is the
 * only part of the page that is about the person rather than the cargo, and it
 * earns its space by answering "how is today going" before anyone scrolls.
 *
 * The greeting follows the reader's own clock, not the server's — a Guangzhou
 * desk at 9am should not be told good evening because the host is in Virginia.
 */
export function WarehouseHero({
  firstName,
  warehouseName,
  emphasis,
  summary,
  hourOfDay,
}: {
  firstName: string;
  warehouseName: string;
  emphasis: "CN" | "TZ";
  summary: TodaySummary;
  /** Local hour at the warehouse, computed on the server for that zone. */
  hourOfDay: number;
}) {
  const greeting =
    hourOfDay < 12 ? "Good morning" : hourOfDay < 17 ? "Good afternoon" : "Good evening";

  // Today only. What is staged, open and in the air is on the strip directly
  // below this banner, and saying it twice makes both copies easier to ignore.
  const chips = [
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

  return (
    <section className="relative mb-6 overflow-hidden rounded-2xl border bg-card">
      {/* Depth without a photograph: a soft brand wash, a faint grid, and a
          blurred highlight. Nothing moves — this page is read a hundred times a
          day and animation on it becomes wallpaper by lunchtime. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/12 via-transparent to-signal/10"
      />
      <div
        aria-hidden
        className="grid-backdrop pointer-events-none absolute inset-0 opacity-30"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-brand/20 blur-3xl"
      />

      <div className="relative p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-bold tracking-tight">
              {greeting}, {firstName}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Welcome back to the {warehouseName}. Here is what is happening
              today.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-5">
            <DualClock emphasis={emphasis} />
            <Link
              href="/app/cargo/new"
              className="inline-flex items-center gap-2 rounded-xl bg-signal px-4 py-2.5 text-sm font-semibold text-signal-foreground shadow-soft transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
            >
              <PackagePlus className="h-4 w-4" />
              Register cargo
            </Link>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {chips.map((chip) => (
            <div
              key={chip.label}
              className="rounded-xl border bg-background/60 p-3 backdrop-blur"
            >
              <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <chip.icon className="h-3.5 w-3.5" />
                {chip.label}
              </dt>
              <dd className="mt-1 font-display text-xl font-bold tabular">
                {chip.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
