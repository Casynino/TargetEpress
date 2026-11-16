import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MessageCircle } from "lucide-react";

import { Hero } from "@/components/site/hero";
import { LiveStats } from "@/components/site/live-stats";
import { COMPANY } from "@/lib/constants";
import { countdownLabel, flightTone, upcomingFlights } from "@/lib/flights";
import { IMAGES, img } from "@/lib/imagery";
import { cn } from "@/lib/utils";

/*
 * The homepage, rebuilt picture-first (owner, 16 Nov 2026): "too many words,
 * not cool — fewer words, more pictures, well arranged", with ORA's site as the
 * standard for how clean a page can be (looked at, not copied). Every section
 * is a photograph or a figure with a few words on it; the detail lives on the
 * pages each section links to (/china, /schedule, /pricing, /contact), and the
 * offices are in the footer on every page.
 */

/** Four steps, each a photograph and a line. A real sequence, so it is numbered. */
const STEPS = [
  { image: IMAGES.packedCartons, title: "Supplier anatuma Guangzhou", line: "Mpe address yetu ya China." },
  { image: IMAGES.cargoHold, title: "Tunapima na kupiga picha", line: "Uzito, vipande, picha na QR." },
  { image: IMAGES.apron, title: "Inapanda ndege", line: "Jumatano, Ijumaa na Jumapili." },
  { image: IMAGES.counter, title: "Unachukua Dar", line: "Lipa, onyesha QR, chukua." },
];

/** What flies, by photograph. Each one is a goods type the business really prices. */
const GOODS = [
  { image: IMAGES.clothingRail, label: "Nguo" },
  { image: IMAGES.electronicsBench, label: "Electronics" },
  { image: IMAGES.sneakers, label: "Viatu" },
  { image: IMAGES.furniture, label: "Samani" },
  { image: IMAGES.autoParts, label: "Vipuri" },
  { image: IMAGES.fabricRolls, label: "Vitambaa" },
];

const WHATSAPP = `https://wa.me/${COMPANY.whatsapp}`;

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-[11px] font-semibold uppercase tracking-[0.24em] text-signal", className)}>{children}</p>
  );
}

export default function HomePage() {
  const flights = upcomingFlights(3);
  const day = (date: Date) => date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  return (
    <>
      <Hero />

      {/* What the company has actually done, counted from the records. */}
      <LiveStats />

      {/* ---- How it works: four photographs ---- */}
      <section className="section">
        <div className="container">
          <Eyebrow>Inafanyaje kazi</Eyebrow>
          <h2 className="mt-3 max-w-xl text-balance font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
            Kutoka kwa Supplier hadi mkononi mwako.
          </h2>

          {/* A row you swipe on a phone, four across on a computer. */}
          <ol className="-mx-4 mt-10 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-4 md:gap-5 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
            {STEPS.map((step, i) => (
              <li key={step.title} className="w-[78%] shrink-0 snap-start sm:w-[46%] md:w-auto">
                <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-muted">
                  <Image
                    src={img(step.image, 800)}
                    alt=""
                    fill
                    sizes="(min-width: 768px) 25vw, 78vw"
                    className="object-cover"
                  />
                  <span className="absolute left-3 top-3 rounded-full bg-black/45 px-2.5 py-1 font-mono text-[11px] font-semibold text-white backdrop-blur-md">
                    0{i + 1}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-lg font-semibold leading-tight">{step.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{step.line}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---- The China address: the one thing a new customer needs ---- */}
      <section id="china" className="pb-16 md:pb-24">
        <div className="container">
          <div className="grid overflow-hidden rounded-3xl border bg-card md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="relative min-h-56 md:min-h-full">
              <Image
                src={img(IMAGES.warehouseAisle, 1200)}
                alt="Mizigo ndani ya ghala letu Guangzhou"
                fill
                sizes="(min-width: 768px) 50vw, 100vw"
                className="object-cover"
              />
            </div>
            <div className="p-6 sm:p-10">
              <Eyebrow>Address ya China</Eyebrow>
              <h2 className="mt-3 text-balance font-display text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
                Mpe Supplier wako address hii.
              </h2>
              <p className="mt-6 text-lg font-semibold leading-relaxed">{COMPANY.chinaOffice.addressCn}</p>
              <p className="mt-1 text-sm text-muted-foreground">{COMPANY.chinaOffice.rooms}</p>
              <Link
                href="/china"
                className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-signal px-5 text-sm font-semibold text-signal-foreground transition-[filter] hover:brightness-110"
              >
                Pata address kamili
                <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---- What flies: a grid of photographs ---- */}
      <section className="section border-t">
        <div className="container">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Tunasafirisha</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
                Kutoka simu hadi vipuri.
              </h2>
            </div>
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-signal underline-offset-4 hover:underline"
            >
              <MessageCircle className="size-4" />
              Uliza bei yako
            </a>
          </div>

          <ul className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5">
            {GOODS.map((g) => (
              <li key={g.label} className="relative aspect-square overflow-hidden rounded-2xl bg-muted md:aspect-[4/3]">
                <Image src={img(g.image, 700)} alt="" fill sizes="(min-width: 768px) 33vw, 50vw" className="object-cover" />
                <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
                <p className="absolute bottom-3 left-3 font-display text-base font-semibold text-white sm:bottom-4 sm:left-4 sm:text-xl">
                  {g.label}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---- The next planes out, over the apron ---- */}
      <section className="relative isolate overflow-hidden bg-[hsl(var(--ink))] py-16 text-white md:py-24">
        <Image src={img(IMAGES.apron, 2000)} alt="" fill sizes="100vw" className="-z-10 object-cover" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-[hsl(var(--ink)/0.78)]" />
        <div className="container">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <Eyebrow>Ratiba</Eyebrow>
              <h2 className="mt-3 font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
                Ndege zinazofuata.
              </h2>
            </div>
            <Link href="/schedule" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/85 underline-offset-4 hover:text-white hover:underline">
              Ratiba kamili <ArrowRight className="size-4" />
            </Link>
          </div>

          {/* The date the plane leaves, and the day the cargo must be in
              Guangzhou — the deadline a customer can still miss. */}
          <ul className="mt-10 divide-y divide-white/15 border-y border-white/15">
            {flights.map((f) => {
              const tone = flightTone(f);
              return (
                <li key={f.departsAt.toISOString()} className="flex items-center gap-4 py-4 sm:py-5">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-xl font-semibold sm:text-2xl">
                      {f.departureDay} <span className="text-white/55">{day(f.departsAt)}</span>
                    </p>
                    <p className="mt-0.5 text-sm text-white/60">
                      Mzigo ufike Guangzhou kabla ya {f.cutOffDay}, {day(f.cutOffAt)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
                      tone === "closed" ? "bg-white/10 text-white/50" : tone === "urgent" ? "bg-signal text-signal-foreground" : "bg-white/10 text-white/85",
                    )}
                  >
                    {countdownLabel(f)}
                  </span>
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

      {/* ---- One last line, and the way to ask ---- */}
      <section className="section">
        <div className="container">
          <div className="relative isolate overflow-hidden rounded-3xl bg-[hsl(var(--ink))] px-6 py-14 text-white sm:px-12 md:py-20">
            <Image src={img(IMAGES.loadingTruck, 1600)} alt="" fill sizes="100vw" className="-z-10 object-cover" />
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[hsl(var(--ink)/0.92)] via-[hsl(var(--ink)/0.75)] to-[hsl(var(--ink)/0.35)]" />
            <h2 className="max-w-lg text-balance font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl">
              Unatuma mzigo mwezi huu?
            </h2>
            <p className="mt-4 max-w-md text-white/75">Tuulize kabla Supplier wako hajatuma.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <a
                href={WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-signal px-5 text-sm font-semibold text-signal-foreground transition-[filter] hover:brightness-110"
              >
                <MessageCircle className="size-4" />
                WhatsApp
              </a>
              <Link
                href="/contact"
                className="inline-flex h-11 items-center rounded-xl border border-white/30 px-5 text-sm font-semibold transition-colors hover:bg-white/10"
              >
                Ofisi zetu
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
