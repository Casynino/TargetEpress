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
 * The homepage (owner, 16 Nov 2026): light and clean — white and sky, clouds,
 * Target's navy and red, real photographs, things moving, few words. Light in
 * either site theme (`theme-light` on the wrapper): the owner chose a white
 * page. The detail lives on the pages each section links to (/china,
 * /schedule, /pricing, /contact); the offices are in the footer on every page.
 */

/** What the business does, in order, as one line. A real sequence. */
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
const SOFT = "bg-[hsl(210_60%_97%)]"; // the pale sky the light sections sit on

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-semibold uppercase tracking-[0.26em] text-signal", className)}>{children}</p>
  );
}

export default function HomePage() {
  const flights = upcomingFlights(3);
  const day = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <div className="theme-light bg-background text-foreground">
      <Hero />

      {/* The globe with the real numbers round it. */}
      <LiveStats />

      {/* ---- What we do: four steps on one line ---- */}
      <section className="relative isolate overflow-hidden py-16 md:py-24">
        <div className="container">
          <Eyebrow className="text-center">Tunafanya nini</Eyebrow>
          <h2 className="mx-auto mt-3 max-w-xl text-balance text-center font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            Kutoka sokoni China, hadi mkononi mwako.
          </h2>

          <ol className="relative mx-auto mt-12 grid max-w-5xl gap-8 md:grid-cols-4 md:gap-4">
            {/* The line the steps sit on, with a light running along it. */}
            <div aria-hidden className="absolute bottom-6 left-7 top-6 w-px bg-gradient-to-b from-signal/60 via-[hsl(214_74%_55%/0.5)] to-[hsl(214_74%_55%/0.15)] md:bottom-auto md:left-[12.5%] md:right-[12.5%] md:top-7 md:h-px md:w-auto md:bg-gradient-to-r">
              <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-full bg-signal shadow-[0_0_12px_3px_hsl(357_78%_58%/0.5)] motion-safe:animate-[flow-y_4s_ease-in-out_infinite] md:left-0 md:top-1/2 md:-translate-y-1/2 md:translate-x-0 md:motion-safe:animate-[flow-x_4s_ease-in-out_infinite]" />
            </div>
            {FLOW.map((step, i) => (
              <li key={step.title} className="relative flex items-center gap-4 md:flex-col md:text-center">
                <span
                  className={cn(
                    "relative grid size-14 shrink-0 place-items-center rounded-full border bg-white shadow-[0_10px_24px_-12px_rgba(15,30,60,0.35)]",
                    i === 0 ? "border-signal/40 text-signal" : "border-[hsl(214_40%_85%)] text-brand",
                  )}
                >
                  <step.icon className="size-6" strokeWidth={1.6} />
                </span>
                <span>
                  <span className="block font-display text-lg font-semibold leading-tight">{step.title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{step.sub}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- China's markets: photographs you swipe ---- */}
      <section className={cn("relative isolate py-16 md:py-24", SOFT)}>
        <div className="container">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Nunua China</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl">Masoko ya China.</h2>
            </div>
            <Link href="/china/markets" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand underline-offset-4 hover:underline">
              Masoko yote <ArrowRight className="size-4" />
            </Link>
          </div>

          <ul className="-mx-4 mt-8 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
            {MARKET_PICKS.map((m) => (
              <li key={m.slug} className="w-[64%] shrink-0 snap-start sm:w-[40%] md:w-auto">
                <Link
                  href={`/china/markets#${m.slug}`}
                  className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-muted shadow-[0_18px_36px_-20px_rgba(15,30,60,0.45)] md:aspect-[4/3]"
                >
                  <Image
                    src={img(marketImage(m.slug), 800)}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 33vw, 64vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.05] motion-reduce:transition-none"
                  />
                  <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />
                  <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                    <p className="font-display text-lg font-semibold leading-tight">{m.name}</p>
                    <p className="mt-1 text-xs text-white/75">{m.city}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- The China address, over the clouds ---- */}
      <section id="china" className="relative isolate overflow-hidden py-20 md:py-28">
        <Image src={img(IMAGES.cloudSea, 2000)} alt="" fill sizes="100vw" className="ken-burns -z-20 object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-white/25" />
        <div className="container">
          <div className="mx-auto max-w-xl rounded-3xl border border-white/70 bg-white/85 p-6 text-center shadow-[0_30px_60px_-30px_rgba(15,30,60,0.45)] backdrop-blur-xl sm:p-10">
            <Eyebrow>Address ya China</Eyebrow>
            <h2 className="mt-3 text-balance font-display text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
              Mpe Supplier wako address hii.
            </h2>
            <p className="mt-6 text-lg font-semibold leading-relaxed">{COMPANY.chinaOffice.addressCn}</p>
            <p className="mt-1 text-sm text-muted-foreground">{COMPANY.chinaOffice.rooms}</p>
            <Link
              href="/china"
              className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-signal px-5 text-sm font-semibold text-signal-foreground shadow-[0_10px_24px_-10px_hsl(357_78%_45%/0.7)] transition-[filter] hover:brightness-110"
            >
              Pata address kamili
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ---- The next planes ---- */}
      <section className={cn("relative isolate py-16 md:py-24", SOFT)}>
        <div className="container">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Ratiba</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl">Ndege zinazofuata.</h2>
            </div>
            <Link href="/schedule" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand underline-offset-4 hover:underline">
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
                    "rounded-2xl border bg-white p-5 shadow-[0_14px_30px_-20px_rgba(15,30,60,0.4)]",
                    tone === "urgent" ? "border-signal/50" : "border-[hsl(214_30%_88%)]",
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn("grid size-9 place-items-center rounded-full", tone === "urgent" ? "bg-signal text-signal-foreground" : "bg-[hsl(214_60%_95%)] text-brand")}>
                      <Plane className="size-4" />
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        tone === "closed" ? "bg-muted text-muted-foreground" : tone === "urgent" ? "bg-signal/10 text-signal" : "bg-[hsl(214_60%_95%)] text-brand",
                      )}
                    >
                      {countdownLabel(f)}
                    </span>
                  </div>
                  <p className="mt-4 font-display text-2xl font-semibold">
                    {f.departureDay} <span className="text-muted-foreground">{day(f.departsAt)}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">Mzigo Guangzhou kabla ya {f.cutOffDay} {day(f.cutOffAt)}</p>
                </li>
              );
            })}
          </ul>

          <Link
            href="/book"
            className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-brand-foreground transition-[filter] hover:brightness-110"
          >
            Book mzigo wako
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      {/* ---- One last line, over the wing ---- */}
      <section className="relative isolate overflow-hidden py-20 md:py-28">
        <Image src={img(IMAGES.wingClouds, 2000)} alt="" fill sizes="100vw" className="ken-burns -z-20 object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-white/95 via-white/70 to-white/0" />
        <div className="container">
          <h2 className="max-w-lg text-balance font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            Unatuma mzigo mwezi huu?
          </h2>
          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-signal px-5 text-sm font-semibold text-signal-foreground shadow-[0_10px_24px_-10px_hsl(357_78%_45%/0.7)] transition-[filter] hover:brightness-110"
            >
              <MessageCircle className="size-4" />
              WhatsApp
            </a>
            <Link href="/contact" className="inline-flex h-11 items-center rounded-xl border border-[hsl(214_30%_80%)] bg-white/80 px-5 text-sm font-semibold backdrop-blur-md transition-colors hover:bg-white">
              Ofisi zetu
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
