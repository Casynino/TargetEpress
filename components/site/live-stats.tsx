import { Boxes, PlaneTakeoff, Users, Warehouse, Weight } from "lucide-react";

import { Reveal } from "@/components/site/reveal";
import { siteStats } from "@/lib/site-stats";

/**
 * The company, in five real numbers.
 *
 * Every figure is a count from the operational database — cargo actually
 * delivered, customers actually served, kilos actually flown. A website that
 * claims ten thousand happy customers is one nobody believes; a website that
 * says 1,247 kilos reads like a company with records.
 *
 * Figures at zero drop out entirely, so the strip fills in as the business
 * grows. The flight rhythm and the two warehouses are always true, so they are
 * always there.
 */
export async function LiveStats() {
  const stats = await siteStats();

  // A count of zero is worse than no count at all: "0 shipments delivered" is
  // the one number on a homepage that actively costs you the customer. Each
  // figure earns its place by being above zero, so the strip fills in as the
  // business grows rather than being switched on all at once.
  const counted = [
    {
      icon: Boxes,
      raw: stats.delivered,
      value: stats.delivered.toLocaleString(),
      label: "shipments delivered",
      sub: "Collected by their owners in Dar",
    },
    {
      icon: Users,
      raw: stats.customers,
      value: stats.customers.toLocaleString(),
      label: "customers served",
      sub: "Importing through us from China",
    },
    {
      icon: Weight,
      raw: stats.weightFlownKg,
      value: `${stats.weightFlownKg.toLocaleString()} kg`,
      label: "flown to Tanzania",
      sub: "Weighed on our own scales",
    },
  ].filter((cell) => cell.raw > 0);

  const cells = [
    ...counted,
    {
      icon: PlaneTakeoff,
      value: String(stats.weeklyFlights),
      label: "flights every week",
      sub: "Wednesday, Friday, Sunday",
    },
    {
      icon: Warehouse,
      value: String(stats.warehouses),
      label: "warehouses",
      sub: "Guangzhou and Dar es Salaam",
    },
  ];

  return (
    <section className="section">
      <div className="container">
        <div
          className={
            cells.length >= 5
              ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-5"
              : cells.length === 4
                ? "grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
                : "grid gap-4 sm:grid-cols-3"
          }
        >
          {cells.map((cell, index) => (
            <Reveal
              key={cell.label}
              delay={index * 70}
              className="rounded-xl border bg-card p-6 text-center shadow-soft"
            >
              <cell.icon className="mx-auto h-6 w-6 text-signal" />
              <p className="mt-3 font-display text-3xl font-extrabold tracking-tight tabular">
                {cell.value}
              </p>
              <p className="mt-1 text-sm font-medium">{cell.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{cell.sub}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
