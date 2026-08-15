import Image from "next/image";
import { Boxes, PlaneTakeoff, Users, Warehouse, Weight } from "lucide-react";

import { Reveal } from "@/components/site/reveal";
import { IMAGES, img } from "@/lib/imagery";
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
      label: "cargo deliveries",
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
    <section className="section relative isolate overflow-hidden text-white">
      {/* An aircraft behind the numbers.
          These are the company's real operating figures, and a photograph of
          the thing that produces them carries them better than empty space.

          The cards are converted to glass with explicit white type rather than
          left on bg-card / text-muted-foreground. Those are theme-aware — white
          cards with dark text in light mode — and putting a photograph behind
          them without converting them is how a section ends up readable in one
          theme and unreadable in the other. */}
      <Image
        src={img(IMAGES.apron, 1920)}
        alt=""
        fill
        sizes="100vw"
        className="-z-10 object-cover object-center"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[hsl(var(--ink)/0.74)]"
      />
      {/* Fades into the sections above and below so the band does not read as a
          photograph pasted between two dark rectangles. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-b from-[hsl(var(--ink))] via-transparent to-[hsl(var(--ink))]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-32 bg-gradient-to-t from-[hsl(var(--gold)/0.12)] to-transparent"
      />

      <div className="container">
        <div
          className={
            cells.length >= 5
              ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
              : cells.length === 4
                ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
                : "grid grid-cols-1 gap-4 sm:grid-cols-3"
          }
        >
          {cells.map((cell, index) => (
            <Reveal
              key={cell.label}
              delay={index * 70}
              className="glass-dark rounded-2xl p-6 text-center shadow-lift"
            >
              <cell.icon className="mx-auto h-6 w-6 text-gold" />
              <p className="mt-3 font-display text-3xl font-extrabold tracking-tight tabular text-white">
                {cell.value}
              </p>
              <p className="mt-1 text-sm font-medium text-white/90">
                {cell.label}
              </p>
              <p className="mt-0.5 text-xs text-white/55">{cell.sub}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
