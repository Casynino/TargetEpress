"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  Calculator,
  MessageCircle,
  PackagePlus,
  PackageSearch,
  Plane,
  ShieldCheck,
  Truck,
  Warehouse,
} from "lucide-react";

import { CargoGlobe } from "@/components/ui/cargo-globe";
import { ParticleField } from "@/components/ui/particle-field";
import { COMPANY } from "@/lib/constants";
import { countdownLabel, upcomingFlights } from "@/lib/flights";
import { normaliseCode } from "@/lib/format";

/**
 * Public hero.
 *
 * Split composition rather than centred: the promise on the left, a panel of
 * actions on the right. It is the layout every airline booking site converges
 * on, and for a good reason — a visitor arrives either to *find out* or to
 * *do*, and a centred column makes both compete for the same space.
 *
 * The panel is the working part. Tracking sits on top because most people who
 * come here already have cargo in the air; booking and pricing sit under it
 * for the ones who do not, and the next departure sits at the bottom because
 * a deadline is what turns "later" into "today".
 *
 * Everything is legible before JavaScript runs. The entrance is CSS, the photo
 * is a real image element, and the only scripted part is the tracking form.
 */
export function Hero() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  // Derived from today's date, never stored. See lib/flights.ts.
  const nextFlight = upcomingFlights(1)[0];

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const code = normaliseCode(query);
    if (!code) return;
    router.push(`/track?q=${encodeURIComponent(code)}`);
  }

  return (
    <section className="relative isolate overflow-hidden bg-[hsl(var(--ink))] text-white">
      {/* The apron, full bleed. Dimmed enough for type, bright enough that you
          can still tell it is cargo being loaded — the photograph is doing a
          job, not decorating. */}
      <Image
        src="https://images.unsplash.com/photo-1515780855147-aee414989c82?auto=format&fit=crop&w=2000&q=70"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center opacity-45"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--ink)/0.95)] via-[hsl(var(--ink)/0.8)] to-[hsl(var(--ink)/0.62)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 hidden lg:block"
        style={{
          background:
            "radial-gradient(circle 460px at 74% 52%, hsl(var(--ink)/0.92) 0%, hsl(var(--ink)/0.72) 45%, transparent 78%)",
        }}
      />

      <ParticleField />

      {/* Only the last strip, so the section hands off to the page below
          without a hard edge. Any more and the photograph disappears. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[hsl(var(--ink))] to-transparent"
      />

      <div className="container relative z-10 pb-16 pt-28 sm:pb-20 sm:pt-32 lg:pb-28 lg:pt-36">
        <div className="grid items-center gap-12 lg:grid-cols-[1.02fr_minmax(0,0.98fr)] lg:gap-8 xl:gap-14">
          {/* Left — the promise, and the three things a visitor can do */}
          <div>
            <span className="rise inline-flex items-center gap-2.5 text-xs font-semibold uppercase tracking-[0.22em] text-gold">
              <Plane className="h-3.5 w-3.5" />
              Guangzhou / Hong Kong → Dar es Salaam
            </span>

            {/* The sentence is long for a headline, so it is set a step smaller
                than the old one and broken where it breaks in speech. "3–10" is
                the number the whole promise turns on, so it carries the accent
                and nothing else in the headline competes with it. */}
            <h1 className="rise rise-1 mt-6 font-display text-3xl font-extrabold leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl">
              Ndani ya siku <span className="text-signal">3–10</span>, mzigo
              wako kutoka China unafika Tanzania
            </h1>

            {/* The three qualities pulled out of the sentence and given their
                own line. As a tail on the headline they were swallowed; as a
                gold rule under it they read as the promise they are. */}
            <p className="rise rise-2 mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold uppercase tracking-[0.18em] text-gold">
              <span>kwa haraka</span>
              <span aria-hidden className="text-gold/40">
                •
              </span>
              <span>salama</span>
              <span aria-hidden className="text-gold/40">
                •
              </span>
              <span>na uhakika</span>
            </p>

            <p className="rise rise-2 mt-6 max-w-xl text-lg leading-relaxed text-white/75">
              Pata bidhaa, tafuta suppliers na viwanda bora nchini China.
              Kupitia Target Express Air Cargo, tunasimamia mchakato mzima wa
              usafirishaji — kutoka China hadi mzigo wako unapofika salama
              Tanzania.
            </p>

            {/* Tracking stays a field rather than becoming a button. It is the
                single most common reason anyone opens this site, and sending
                someone to another page to type a number they already have in
                their hand is a step for nothing. */}
            <form onSubmit={onSubmit} className="rise rise-3 mt-8 max-w-md">
              <div className="flex gap-2.5">
                <div className="relative flex-1">
                  <PackageSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="TX-000123"
                    aria-label="Tracking or batch number"
                    className="h-12 w-full rounded-xl border border-white/20 bg-[hsl(var(--ink)/0.5)] pl-10 pr-4 font-mono text-sm uppercase tabular text-white outline-none transition-colors placeholder:font-sans placeholder:normal-case placeholder:text-white/30 focus:border-gold focus:bg-[hsl(var(--ink)/0.75)]"
                  />
                </div>
                <button
                  type="submit"
                  className="flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-signal px-6 font-semibold text-signal-foreground transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
                >
                  Fuatilia
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </form>

            <div className="rise rise-3 mt-4 flex flex-wrap gap-2.5">
              {[
                { href: "/pricing", icon: Calculator, label: "What it will cost" },
                { href: "/china/markets", icon: Warehouse, label: "Explore China markets" },
                { href: "/book", icon: PackagePlus, label: "Book a shipment" },
              ].map((action) => (
                <Link
                  key={action.label}
                  href={action.href}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-medium transition-colors hover:border-gold/40 hover:bg-white/10"
                >
                  <action.icon className="h-4 w-4 text-gold" />
                  {action.label}
                </Link>
              ))}
            </div>

            <ul className="rise rise-4 mt-9 grid gap-x-8 gap-y-3 border-t border-white/10 pt-7 sm:grid-cols-2">
              {[
                { icon: Warehouse, label: "Our own warehouse in Guangzhou" },
                { icon: ShieldCheck, label: "QR-verified collection" },
                { icon: Truck, label: "We collect from your supplier" },
                {
                  icon: Plane,
                  label: `${COMPANY.instagramFollowers} customers on Instagram`,
                },
              ].map(({ icon: Icon, label }) => (
                <li
                  key={label}
                  className="flex items-center gap-2.5 text-sm text-white/70"
                >
                  <Icon className="h-4 w-4 shrink-0 text-signal" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          {/* Right — the globe, in its own column so nothing crops it */}
          <div className="rise rise-4 relative hidden lg:block">
            {/* The mask existed to hide the hard edge of a filled sphere.
                There is no longer a filled sphere, so it only has to feather
                the outermost ring of dots. */}
            <div
              style={{
                maskImage:
                  "radial-gradient(circle at 50% 50%, #000 88%, transparent 100%)",
                WebkitMaskImage:
                  "radial-gradient(circle at 50% 50%, #000 88%, transparent 100%)",
              }}
            >
              <CargoGlobe />
            </div>

            {/* The deadline, floated over the sphere. It is the one number that
                turns a browser into a booking, so it does not get buried. */}
            {nextFlight ? (
              <div className="glass-dark absolute bottom-2 left-1/2 flex w-[min(100%,320px)] -translate-x-1/2 items-center justify-between gap-3 rounded-2xl px-4 py-3">
                <span className="min-w-0">
                  <span className="block text-[11px] uppercase tracking-widest text-gold">
                    Ndege inayofuata
                  </span>
                  <span className="block text-sm font-semibold">
                    {nextFlight.departureDay},{" "}
                    {nextFlight.departsAt.toLocaleDateString("en-GB", {
                      day: "numeric",
                      month: "short",
                    })}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-signal px-2.5 py-1 text-[11px] font-bold text-signal-foreground">
                  {countdownLabel(nextFlight)}
                </span>
              </div>
            ) : null}
          </div>

          {/* Below lg the globe is hidden, so the next flight still needs a
              home. */}
          {nextFlight ? (
            <div className="rise rise-4 flex items-center justify-between gap-3 rounded-xl border border-signal/25 bg-signal/10 px-4 py-3 lg:hidden">
              <span className="min-w-0">
                <span className="block text-[11px] uppercase tracking-widest text-white/50">
                  Ndege inayofuata
                </span>
                <span className="block text-sm font-semibold">
                  {nextFlight.departureDay},{" "}
                  {nextFlight.departsAt.toLocaleDateString("en-GB", {
                    day: "numeric",
                    month: "short",
                  })}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-signal px-2.5 py-1 text-[11px] font-bold text-signal-foreground">
                {countdownLabel(nextFlight)}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
