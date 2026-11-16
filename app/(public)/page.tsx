import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MessageCircle, PackageCheck, Plane, Search, Warehouse } from "lucide-react";

import { Hero } from "@/components/site/hero";
import { LiveStats } from "@/components/site/live-stats";
import { COMPANY } from "@/lib/constants";
import { countdownLabel, flightTone, upcomingFlights } from "@/lib/flights";
import { IMAGES, img, marketImage } from "@/lib/imagery";
import { MARKETS } from "@/lib/markets";
import { cn } from "@/lib/utils";

/*
 * The homepage (owner, 16 Nov 2026): futuristic, moving, few words — a real
 * aircraft at night, a floor of light, the globe with the company's numbers
 * round it, glowing steps, the markets as photographs. Night all the way down
 * in either theme (`dark` on the wrapper): the page is one picture, and a white
 * band half way would break it. The detail lives on the pages each section
 * links to (/china, /schedule, /pricing, /contact); the offices are in the
 * footer on every page.
 */

/** What the business does, in order, as one glowing line. A real sequence. */
const FLOW = [
  { icon: Search, title: "Tunatafuta bidhaa", sub: "Sourcing China" },
  { icon: Warehouse, title: "Ghala Guangzhou", sub: "Tunapima na kupiga picha" },
  { icon: Plane, title: "Ndege kwenda Dar", sub: "Mara 3 kila wiki" },
  { icon: PackageCheck, title: "Unachukua Dar", sub: "Kwa QR yako" },
];

/** Six markets, each with its own photograph, read from the market guide so names never drift. */
const MARKET_PICKS = [
  "guangzhou-wholesale-markets",
  "shenzhen-electronics-markets",
  "guangzhou-shoe-markets",
  "foshan-furniture-markets",
  "guangzhou-auto-parts",
  "zhongda-fabric-market",
]
  .map((slug) => MARKETS.find((m) => m.slug === slug))
  .filter((m): m is (typeof MARKETS)[number] => Boolean(m));

const WHATSAPP = `https://wa.me/${COMPANY.whatsapp}`;

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-semibold uppercase tracking-[0.26em] text-signal", className)}>{children}</p>
  );
}

/** A faint blueprint grid behind a section, fading at its edges. */
function Grid() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 opacity-[0.12] [background-image:linear-gradient(hsl(214_74%_62%)_1px,transparent_1px),linear-gradient(90deg,hsl(214_74%_62%)_1px,transparent_1px)] [background-size:44px_44px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_50%,black,transparent)]"
    />
  );
}

export default function HomePage() {
  const flights = upcomingFlights(3);
  const day = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div className="dark bg-[hsl(var(--ink))] text-white">
      <Hero />

      {/* The globe with the real numbers round it. */}
      <LiveStats />

      {/* ---- What we do: four glowing steps on one line ---- */}
      <section className="relative isolate overflow-hidden py-16 md:py-24">
        <Grid />
        <div className="container">
          <Eyebrow className="text-center">Tunafanya nini</Eyebrow>
          <h2 className="mx-auto mt-3 max-w-xl text-balance text-center font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            Kutoka sokoni China, hadi mkononi mwako.
          </h2>

          <ol className="relative mx-auto mt-12 grid max-w-5xl gap-8 md:grid-cols-4 md:gap-4">
            {/* The line the steps sit on, with a light running along it. */}
            <div aria-hidden className="absolute bottom-6 left-7 top-6 w-px bg-gradient-to-b from-signal/70 via-[hsl(214_74%_62%/0.6)] to-[hsl(214_74%_62%/0.15)] md:bottom-auto md:left-[12.5%] md:right-[12.5%] md:top-7 md:h-px md:w-auto md:bg-gradient-to-r">
              <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-full bg-white shadow-[0_0_14px_4px_hsl(214_74%_62%/0.8)] motion-safe:animate-[flow-y_4s_ease-in-out_infinite] md:left-0 md:top-1/2 md:-translate-y-1/2 md:translate-x-0 md:motion-safe:animate-[flow-x_4s_ease-in-out_infinite]" />
            </div>
            {FLOW.map((step, i) => (
              <li key={step.title} className="relative flex items-center gap-4 md:flex-col md:text-center">
                <span
                  className={cn(
                    "relative grid size-14 shrink-0 place-items-center rounded-full border bg-[hsl(var(--ink))]",
                    i === 0 ? "border-signal/60 text-signal shadow-[0_0_24px_hsl(357_78%_58%/0.45)]" : "border-[hsl(214_74%_62%/0.5)] text-[hsl(214_74%_70%)] shadow-[0_0_24px_hsl(214_74%_62%/0.35)]",
                  )}
                >
                  <step.icon className="size-6" strokeWidth={1.6} />
                </span>
                <span>
                  <span className="block font-display text-lg font-semibold leading-tight">{step.title}</span>
                  <span className="mt-0.5 block text-sm text-white/55">{step.sub}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- China's markets: photographs you swipe ---- */}
      <section className="relative isolate pb-16 md:pb-24">
        <div className="container">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Nunua China</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl">Masoko ya China.</h2>
            </div>
            <Link href="/china/markets" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline">
              Masoko yote <ArrowRight className="size-4" />
            </Link>
          </div>

          <ul className="-mx-4 mt-8 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
            {MARKET_PICKS.map((m) => (
              <li key={m.slug} className="w-[64%] shrink-0 snap-start sm:w-[40%] md:w-auto">
                <Link
                  href={`/china/markets#${m.slug}`}
                  className="group relative block aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-[0_20px_40px_-20px_rgba(0,0,0,0.8)] transition-[border-color,box-shadow] hover:border-[hsl(214_74%_62%/0.6)] hover:shadow-[0_0_30px_hsl(214_74%_62%/0.25)] md:aspect-[4/3]"
                >
                  <Image
                    src={img(marketImage(m.slug), 800)}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 33vw, 64vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.05] motion-reduce:transition-none"
                  />
                  <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[hsl(var(--ink))] via-[hsl(var(--ink)/0.4)] to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="font-display text-lg font-semibold leading-tight">{m.name}</p>
                    <p className="mt-1 text-xs text-white/65">{m.city}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- The China address, over the earth at night ---- */}
      <section id="china" className="relative isolate overflow-hidden py-20 md:py-28">
        <Image src={img(IMAGES.earthNight, 2000)} alt="" fill sizes="100vw" className="ken-burns -z-20 object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-[hsl(var(--ink))] via-[hsl(var(--ink)/0.45)] to-[hsl(var(--ink))]" />
        <div className="container">
          <div className="mx-auto max-w-xl rounded-3xl border border-white/15 bg-[hsl(var(--ink)/0.55)] p-6 text-center shadow-[0_0_60px_hsl(214_74%_62%/0.15)] backdrop-blur-xl sm:p-10">
            <Eyebrow>Address ya China</Eyebrow>
            <h2 className="mt-3 text-balance font-display text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
              Mpe Supplier wako address hii.
            </h2>
            <p className="mt-6 text-lg font-semibold leading-relaxed">{COMPANY.chinaOffice.addressCn}</p>
            <p className="mt-1 text-sm text-white/55">{COMPANY.chinaOffice.rooms}</p>
            <Link
              href="/china"
              className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-signal px-5 text-sm font-semibold text-signal-foreground shadow-[0_0_24px_hsl(357_78%_58%/0.45)] transition-[filter] hover:brightness-110"
            >
              Pata address kamili
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ---- The next planes, over an aircraft coming in to land ---- */}
      <section className="relative isolate overflow-hidden py-16 md:py-24">
        <Image src={img(IMAGES.planeLanding, 2000)} alt="" fill sizes="100vw" className="-z-20 object-cover object-[50%_30%]" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-[hsl(var(--ink))] via-[hsl(var(--ink)/0.78)] to-[hsl(var(--ink))]" />
        <div className="container">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Ratiba</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl">Ndege zinazofuata.</h2>
            </div>
            <Link href="/schedule" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/80 underline-offset-4 hover:text-white hover:underline">
              Ratiba kamili <ArrowRight className="size-4" />
            </Link>
          </div>

          {/* The day the plane leaves, and the day the cargo must be in
              Guangzhou — the deadline a customer can still miss. */}
          <ul className="mt-10 grid gap-3 md:grid-cols-3">
            {flights.map((f) => {
              const tone = flightTone(f);
              return (
                <li
                  key={f.departsAt.toISOString()}
                  className={cn(
                    "rounded-2xl border bg-[hsl(var(--ink)/0.55)] p-5 backdrop-blur-md",
                    tone === "urgent" ? "border-signal/50 shadow-[0_0_30px_hsl(357_78%_58%/0.2)]" : "border-white/12",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <Plane className={cn("size-5", tone === "urgent" ? "text-signal" : "text-[hsl(214_74%_70%)]")} />
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        tone === "closed" ? "bg-white/10 text-white/50" : tone === "urgent" ? "bg-signal text-signal-foreground" : "bg-white/10 text-white/85",
                      )}
                    >
                      {countdownLabel(f)}
                    </span>
                  </div>
                  <p className="mt-4 font-display text-2xl font-semibold">
                    {f.departureDay} <span className="text-white/50">{day(f.departsAt)}</span>
                  </p>
                  <p className="mt-1 text-sm text-white/55">Mzigo Guangzhou kabla ya {f.cutOffDay} {day(f.cutOffAt)}</p>
                </li>
              );
            })}
          </ul>

          <Link
            href="/book"
            className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[hsl(var(--ink))] transition-colors hover:bg-white/90"
          >
            Book mzigo wako
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* ---- One last line, over the wing ---- */}
      <section className="relative isolate overflow-hidden py-20 md:py-28">
        <Image src={img(IMAGES.wingClouds, 2000)} alt="" fill sizes="100vw" className="ken-burns -z-20 object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[hsl(var(--ink)/0.95)] via-[hsl(var(--ink)/0.7)] to-[hsl(var(--ink)/0.2)]" />
        <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-24 bg-gradient-to-b from-[hsl(var(--ink))] to-transparent" />
        <div className="container">
          <h2 className="max-w-lg text-balance font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            Unatuma mzigo mwezi huu?
          </h2>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-signal px-5 text-sm font-semibold text-signal-foreground shadow-[0_0_24px_hsl(357_78%_58%/0.45)] transition-[filter] hover:brightness-110"
            >
              <MessageCircle className="size-4" />
              WhatsApp
            </a>
            <Link href="/contact" className="inline-flex h-11 items-center rounded-xl border border-white/30 bg-white/5 px-5 text-sm font-semibold backdrop-blur-md transition-colors hover:bg-white/10">
              Ofisi zetu
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
