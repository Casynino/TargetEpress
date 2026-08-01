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
    <section className="relative overflow-hidden bg-[hsl(var(--ink))] text-white">
      {/* The apron, full bleed. Dimmed enough for type, bright enough that you
          can still tell it is cargo being loaded — the photograph is doing a
          job, not decorating. */}
      <Image
        src="https://images.unsplash.com/photo-1515780855147-aee414989c82?auto=format&fit=crop&w=2000&q=70"
        alt=""
        fill
        priority
        sizes="100vw"
        className="object-cover object-center opacity-25"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--ink)/0.98)] via-[hsl(var(--ink)/0.9)] to-[hsl(var(--ink)/0.82)]"
      />
      {/* Only the last strip, so the section hands off to the page below
          without a hard edge. Any more and the photograph disappears. */}
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[hsl(var(--ink))] to-transparent"
      />

      {/* The globe is the backdrop, not a column.
          Beside the panel there is simply no room for a sphere — it got sliced
          by the viewport and read as broken. Centred behind everything it is
          whole, nothing crops it, and the content floats over the route. */}
      {/* The mask only softens the very edge, so the sphere fades into the
          section instead of ending on a hard circle. Any stronger and the
          globe disappears, which is what happened the first time. */}
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 w-[min(150vw,1150px)] -translate-x-1/2 -translate-y-1/2 opacity-90 sm:w-[min(120vw,1000px)] lg:w-[min(92vw,1080px)]"
        style={{ maskImage: "radial-gradient(circle at 50% 50%, #000 78%, transparent 97%)", WebkitMaskImage: "radial-gradient(circle at 50% 50%, #000 78%, transparent 97%)" }}
      >
        {/* Only the sphere itself takes the pointer, so dragging works without
            the wrapper swallowing clicks meant for the page. */}
        <div className="pointer-events-auto">
          <CargoGlobe />
        </div>
      </div>

      <div className="container relative z-10 py-16 sm:py-20 lg:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_minmax(0,380px)] lg:gap-10 xl:gap-16">
          {/* Left — the promise */}
          <div>
            <span className="rise inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] backdrop-blur">
              <Plane className="h-3.5 w-3.5 text-signal" />
              Guangzhou → Dar es Salaam
            </span>

            <h1 className="rise rise-1 mt-6 font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Ndani ya siku tatu,
              <br />
              <span className="text-signal">mzigo wako</span> uko mlangoni
            </h1>

            <p className="rise rise-2 mt-6 max-w-xl text-lg leading-relaxed text-white/75">
              Tunasafirisha mizigo yako kutoka China hadi Tanzania kwa bei
              nafuu — na unaweza kufuatilia kila hatua.
              <span className="mt-2 block text-base text-white/50">
                Air cargo from Guangzhou and Hong Kong, tracked from our own
                warehouse in China to the moment you collect it in Dar.
              </span>
            </p>

            <ul className="rise rise-3 mt-9 grid gap-x-8 gap-y-3 sm:grid-cols-2">
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

          {/* Right — the panel that does something */}
          <div className="rise rise-4 rounded-3xl border border-white/15 bg-white/[0.07] p-6 shadow-2xl backdrop-blur-xl sm:p-7">
            <h2 className="font-display text-xl font-bold">
              Fuatilia mzigo wako
            </h2>
            <p className="mt-1 text-sm text-white/55">
              Weka namba uliyopewa — e.g. TX-000123
            </p>

            <form onSubmit={onSubmit} className="mt-5">
              <div className="relative">
                <PackageSearch className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="TX-000123"
                  aria-label="Tracking or batch number"
                  className="w-full rounded-xl border border-white/20 bg-[hsl(var(--ink)/0.5)] py-3.5 pl-10 pr-4 font-mono text-sm uppercase tabular text-white outline-none transition-colors placeholder:font-sans placeholder:normal-case placeholder:text-white/30 focus:border-signal focus:bg-[hsl(var(--ink)/0.75)]"
                />
              </div>
              <button
                type="submit"
                className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-signal font-semibold text-signal-foreground transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
              >
                Fuatilia
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>

            {/* Lower case deliberately: "AU" in tracked capitals reads as an
                airline code sitting in the middle of a cargo site. */}
            <div className="my-6 flex items-center gap-3 text-xs text-white/35">
              <span className="h-px flex-1 bg-white/15" />
              au / or
              <span className="h-px flex-1 bg-white/15" />
            </div>

            <div className="grid gap-2.5">
              {[
                {
                  href: "/book",
                  icon: PackagePlus,
                  title: "Book a shipment",
                  sub: "Tell us cargo is coming",
                  external: false,
                },
                {
                  href: "/pricing",
                  icon: Calculator,
                  title: "What it will cost",
                  sub: "How we price, and how to get a quote",
                  external: false,
                },
                {
                  href: `https://wa.me/${COMPANY.whatsapp}`,
                  icon: MessageCircle,
                  title: "WhatsApp us",
                  sub: COMPANY.phone,
                  external: true,
                },
              ].map((action) => {
                const inner = (
                  <>
                    <action.icon className="h-4 w-4 shrink-0 text-signal" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">
                        {action.title}
                      </span>
                      <span className="block text-xs text-white/50">
                        {action.sub}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-white/30" />
                  </>
                );
                const className =
                  "flex items-center gap-3 rounded-xl border border-white/15 bg-white/5 px-4 py-3 transition-colors hover:bg-white/10";

                return action.external ? (
                  <a
                    key={action.title}
                    href={action.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={className}
                  >
                    {inner}
                  </a>
                ) : (
                  <Link key={action.title} href={action.href} className={className}>
                    {inner}
                  </Link>
                );
              })}
            </div>

            {/* The deadline, where somebody deciding whether to act can see it. */}
            {nextFlight ? (
              <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-signal/25 bg-signal/10 px-4 py-3">
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
      </div>
    </section>
  );
}
