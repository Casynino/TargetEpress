import Image from "next/image";
import Link from "next/link";
import { ArrowRight, MapPin, MessageCircle, Plane } from "lucide-react";

import { Hero } from "@/components/site/hero";
import { LiveStats } from "@/components/site/live-stats";
import { Reveal, RevealWords, ScrollProgress, Tilt } from "@/components/site/reveal";
import { AIRCRAFT_PATH } from "@/lib/aircraft";
import { COMPANY } from "@/lib/constants";
import { daysAwaySwahili, flightTone, SWAHILI_DAYS, upcomingFlights } from "@/lib/flights";
import { IMAGES, img, marketImage } from "@/lib/imagery";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

/*
 * The homepage (owner, 16 Nov 2026). The scene first, then a page that belongs
 * to it: every section floats on the site's living sky (SiteSky) as glass, and
 * follows the day/night switch through the theme tokens, which are Target's
 * own navy, red and white.
 *
 * What it has to say, in the order a trader needs it: this company buys in
 * China for you and flies it home. It says it in pictures and very few words
 * ("use very less words"; one heading a section, no line under it), and the
 * words are the everyday ones (Warehouse, Supplier, Address: what customers
 * say, not their dictionary Swahili). Sourcing and the China markets carry the
 * middle of the page because that is the business: the more a customer buys in
 * China, the more there is to fly. The detail lives on the pages each section
 * links to.
 *
 * The flights and the markets move, so the page is rebuilt hourly rather than
 * frozen at the last deploy.
 */
export const revalidate = 3600;

/** What the business does, in order. A real sequence, so it is numbered. */
const JOURNEY = [
  { title: "Tunatafuta bidhaa", image: IMAGES.boutique },
  { title: "Warehouse Guangzhou", image: IMAGES.warehouseFloor },
  { title: "Ndege kwenda Dar", image: IMAGES.planeInSky },
  { title: "Unachukua Dar", image: IMAGES.parcelHandover },
];

/** How buying for a customer goes, as the sourcing page tells it, in as few words as it takes. */
const SOURCING = ["Tuma picha au link", "Tunatafuta na kukagua", "Unakubali bei kwanza", "Inaruka hadi Dar"];

const WHATSAPP = `https://wa.me/${COMPANY.whatsapp}`;
const NAVY = "#182A48"; // Target's navy, from the logo; the red is the `signal` token

const TITLE = "text-balance font-display text-[1.7rem] font-semibold leading-[1.1] tracking-[-0.035em] sm:text-[2.5rem]";
const MORE = "inline-flex items-center gap-1.5 text-sm font-semibold text-brand underline-offset-4 hover:underline";
const RED_BUTTON =
  "inline-flex h-11 items-center gap-2 rounded-full bg-[#D81E2A] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgba(216,30,42,0.8)] transition-[filter] hover:brightness-110";
/** Where `.container` starts, for a row that runs off the screen's edge but begins in line with the page. */
const EDGE = "px-4 sm:px-6 lg:px-8 2xl:px-[calc((100vw-82.5rem)/2+2rem)]";

export default async function HomePage() {
  const flights = upcomingFlights(3);
  const date = (d: Date) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

  // The directory the CEO edits at /app/admin/markets, the same one the markets page reads. Each market
  // shows once per photograph: two cards with one picture side by side read as a mistake.
  const allMarkets = await prisma.chinaMarket.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { slug: true, name: true, city: true },
  });
  const seen = new Set<string>();
  const markets = allMarkets.filter((m) => {
    const picture = marketImage(m.slug);
    if (seen.has(picture)) return false;
    seen.add(picture);
    return true;
  });

  return (
    <>
      <Hero />

      {/* What the company has actually done, counted from the records. */}
      <LiveStats />

      {/* ---- The route: four stops on one line, and a plane that flies it as the page is scrolled ---- */}
      <section className="section relative">
        <div className="container">
          <RevealWords text="Kutoka sokoni China, hadi mkononi mwako." className={cn(TITLE, "max-w-xl")} />

          <ScrollProgress as="ol" mode="view" className="route mt-8 md:mt-12">
            <div aria-hidden className="route-line">
              <span className="route-flown" />
              <span className="route-plane">
                <svg viewBox="-18 -18 36 36">
                  <path d={AIRCRAFT_PATH} fill="currentColor" />
                </svg>
              </span>
            </div>
            {JOURNEY.map((step, i) => (
              <li key={step.title} className="route-stop">
                <span aria-hidden className="route-node" />
                <Reveal delay={i * 90}>
                  <Tilt className="flex items-center gap-4 overflow-hidden rounded-2xl border bg-card p-2.5 md:block md:p-0">
                    <span className="relative block size-[5.25rem] shrink-0 overflow-hidden rounded-xl md:aspect-[4/3] md:size-auto md:rounded-none">
                      <Image src={img(step.image, 700)} alt="" fill sizes="(min-width: 768px) 25vw, 6rem" className="object-cover" />
                    </span>
                    <span className="block md:p-5">
                      <span className="block font-display text-xs font-semibold tabular text-signal">0{i + 1}</span>
                      <span className="mt-1 block font-display text-[1.05rem] font-semibold leading-tight tracking-tight md:text-xl">{step.title}</span>
                    </span>
                  </Tilt>
                </Reveal>
              </li>
            ))}
          </ScrollProgress>
        </div>
      </section>

      {/* ---- Sourcing: the company buys for you ---- */}
      <section id="sourcing" className="section relative pt-0 md:pt-0">
        <div className="container">
          <div className="grid grid-cols-1 items-center gap-8 overflow-hidden rounded-[1.75rem] border bg-card p-5 sm:p-8 lg:grid-cols-2 lg:gap-12 lg:p-12">
            <div>
              <h2 className={TITLE}>
                <RevealWords as="span" text="Huwezi kwenda China?" className="block" />
                <RevealWords as="span" text="Tunanunua kwa niaba yako." className="block text-signal" />
              </h2>

              <ol className="mt-7 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                {SOURCING.map((line, i) => (
                  <Reveal as="li" key={line} delay={80 + i * 70} className="flex items-center gap-3">
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand font-display text-sm font-semibold text-brand-foreground">{i + 1}</span>
                    <span className="text-[15px] font-medium">{line}</span>
                  </Reveal>
                ))}
              </ol>

              <Reveal delay={200} className="mt-8 flex flex-wrap gap-3">
                <Link href="/services/sourcing" className={RED_BUTTON}>
                  Tuma ombi
                  <ArrowRight className="size-4" />
                </Link>
                <a
                  href={WHATSAPP}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-11 items-center gap-2 rounded-full border border-brand/30 px-5 text-sm font-semibold transition-colors hover:bg-brand/10"
                >
                  <MessageCircle className="size-4" />
                  WhatsApp
                </a>
              </Reveal>
            </div>

            {/* What people ask us to buy. */}
            <div className="grid h-[19rem] grid-cols-[1.15fr_1fr] grid-rows-2 gap-3 sm:h-[25rem] sm:gap-4">
              <Tilt className="row-span-2 overflow-hidden rounded-2xl bg-muted">
                <Image src={img(IMAGES.clothesShop, 900)} alt="" fill sizes="(min-width: 1024px) 25vw, 55vw" className="object-cover" />
                <Tag>Nguo</Tag>
              </Tilt>
              <Tilt className="overflow-hidden rounded-2xl bg-muted">
                <Image src={img(IMAGES.sneakerPair, 700)} alt="" fill sizes="(min-width: 1024px) 20vw, 45vw" className="object-cover" />
                <Tag>Viatu</Tag>
              </Tilt>
              <Tilt className="overflow-hidden rounded-2xl bg-muted">
                <Image src={img(IMAGES.gadgetsDesk, 700)} alt="" fill sizes="(min-width: 1024px) 20vw, 45vw" className="object-cover" />
                <Tag>Electronics</Tag>
              </Tilt>
            </div>
          </div>
        </div>
      </section>

      {/* ---- China's markets: tall photographs in a row ---- */}
      {markets.length > 0 ? (
        <ScrollProgress as="section" mode="pin" className="run-pin relative">
          <div className="run-stick pb-16 md:pb-24 lg:pb-0">
            <div className="container flex flex-wrap items-end justify-between gap-4">
              <RevealWords text="Masoko ya China." className={TITLE} />
              <Link href="/china/markets" className={MORE}>
                Yote {allMarkets.length} <ArrowRight className="size-4" />
              </Link>
            </div>

            <div className="run-view mt-7 lg:mt-9">
              <ul className={cn("run-track flex w-max snap-x snap-mandatory scroll-px-4 gap-3 pb-2 sm:gap-5 lg:snap-none", EDGE)}>
                {markets.map((m, i) => (
                  <li key={m.slug} className="snap-start">
                    <Tilt className="rounded-2xl">
                      <Link
                        href={`/china/markets#${m.slug}`}
                        className="group relative block h-[22rem] w-[15rem] overflow-hidden rounded-2xl bg-[hsl(var(--ink))] shadow-lift sm:h-[27rem] sm:w-[19rem] lg:h-[min(31rem,60vh)] lg:w-[21rem]"
                      >
                        <Image
                          src={img(marketImage(m.slug), 700)}
                          alt=""
                          fill
                          sizes="21rem"
                          className="object-cover transition-transform duration-700 group-hover:scale-[1.05] motion-reduce:transition-none"
                        />
                        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0b1526]/95 via-[#0b1526]/10 to-[#0b1526]/30" />
                        <span className="absolute left-5 top-5 font-mono text-[11px] tabular text-white/80">
                          {String(i + 1).padStart(2, "0")} / {String(markets.length).padStart(2, "0")}
                        </span>
                        <ArrowRight className="absolute right-5 top-5 size-4 -translate-x-1 text-white opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                        <span className="absolute inset-x-0 bottom-0 p-5 text-white">
                          <span className="flex items-center gap-1.5 text-xs text-white/70">
                            <MapPin className="size-3.5 shrink-0" />
                            {m.city}
                          </span>
                          <span className="mt-2 block font-display text-[1.3rem] font-semibold leading-tight tracking-tight sm:text-2xl">{m.name}</span>
                        </span>
                      </Link>
                    </Tilt>
                  </li>
                ))}
                <li className="snap-start">
                  <Link
                    href="/china/markets"
                    className="group flex h-[22rem] w-[12rem] flex-col justify-between rounded-2xl p-6 text-white shadow-lift sm:h-[27rem] sm:w-[14rem] lg:h-[min(31rem,60vh)]"
                    style={{ backgroundColor: NAVY }}
                  >
                    <span className="font-display text-6xl font-semibold tabular tracking-tight">{allMarkets.length}</span>
                    <span>
                      <span className="block font-display text-2xl font-semibold leading-tight tracking-tight">Masoko yote</span>
                      <span className="mt-4 grid size-11 place-items-center rounded-full bg-[#D81E2A] transition-transform group-hover:translate-x-1">
                        <ArrowRight className="size-5" />
                      </span>
                    </span>
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </ScrollProgress>
      ) : null}

      {/* ---- The China address: a Target navy band, the warehouse faint behind it ---- */}
      <section id="china" className="relative isolate overflow-hidden py-16 text-white md:py-24" style={{ backgroundColor: NAVY }}>
        <Image src={img(IMAGES.warehouseAisle, 2000)} alt="" fill sizes="100vw" className="ken-burns -z-20 object-cover opacity-25 mix-blend-luminosity" />
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: `radial-gradient(ellipse 60% 70% at 50% 50%, transparent, ${NAVY})` }} />
        <div className="container">
          <div className="mx-auto max-w-xl text-center">
            <RevealWords text="Mpe Supplier wako address hii." className={cn(TITLE, "sm:text-4xl")} />
            <Reveal delay={120}>
              <p className="mt-6 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4 text-lg font-semibold leading-relaxed backdrop-blur-md">{COMPANY.chinaOffice.addressCn}</p>
              <p className="mt-2 text-sm text-white/60">{COMPANY.chinaOffice.rooms}</p>
              <Link href="/china" className={cn(RED_BUTTON, "mt-7")}>
                Address kamili
                <ArrowRight className="size-4" />
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ---- The next planes ---- */}
      <section className="section relative">
        <div className="container">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <RevealWords text="Ndege zinazofuata." className={TITLE} />
            <Link href="/schedule" className={MORE}>
              Ratiba <ArrowRight className="size-4" />
            </Link>
          </div>

          {/* The day the plane leaves, and the day the cargo must be in
              Guangzhou — the deadline a customer can still miss. */}
          <ul className="mt-7 grid gap-3 md:mt-9 md:grid-cols-3 md:gap-5">
            {flights.map((f, i) => {
              const tone = flightTone(f);
              return (
                <Reveal as="li" key={f.departsAt.toISOString()} delay={i * 90} className={cn("rounded-2xl border bg-card p-5", tone === "urgent" && "border-signal/50")}>
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn("grid size-9 place-items-center rounded-full", tone === "urgent" ? "bg-signal text-signal-foreground" : "bg-brand/10 text-brand")}>
                      <Plane className="size-4" />
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                        tone === "closed" ? "bg-muted text-muted-foreground" : tone === "urgent" ? "bg-signal/10 text-signal" : "bg-brand/10 text-brand",
                      )}
                    >
                      {daysAwaySwahili(f.daysAway)}
                    </span>
                  </div>
                  <p className="mt-4 font-display text-2xl font-semibold tracking-tight">
                    {SWAHILI_DAYS[f.departsAt.getDay()]} <span className="text-muted-foreground">{date(f.departsAt)}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Lete mzigo kabla ya {SWAHILI_DAYS[f.cutOffAt.getDay()]} {date(f.cutOffAt)}
                  </p>
                </Reveal>
              );
            })}
          </ul>

          <Reveal delay={120}>
            <Link href="/book" className={cn(RED_BUTTON, "mt-8")}>
              Book mzigo
              <ArrowRight className="size-4" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ---- One last line: a Target red band, the wing faint in it ---- */}
      <section className="relative isolate -mb-20 overflow-hidden bg-[#D81E2A] py-16 text-white md:py-24">
        <Image src={img(IMAGES.wingClouds, 2000)} alt="" fill sizes="100vw" className="ken-burns -z-20 object-cover opacity-30 mix-blend-multiply" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#D81E2A] via-[#D81E2A]/80 to-transparent" />
        <div className="container">
          <RevealWords text="Unatuma mzigo mwezi huu?" className={cn(TITLE, "max-w-lg sm:text-5xl")} />
          <Reveal delay={150} className="mt-8 flex flex-wrap gap-3">
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-[#D81E2A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.45)] transition-colors hover:bg-white/90"
            >
              <MessageCircle className="size-4" />
              WhatsApp
            </a>
            <Link href="/contact" className="inline-flex h-11 items-center rounded-full border border-white/50 px-5 text-sm font-semibold transition-colors hover:bg-white/10">
              Ofisi zetu
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}

/** The word on a sourcing photograph. */
function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="absolute bottom-3 left-3 z-[1] rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-[#182A48] shadow-soft">{children}</span>
  );
}
