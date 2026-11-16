import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock, MapPin, MessageCircle, Plane } from "lucide-react";

import { Hero } from "@/components/site/hero";
import { LiveStats } from "@/components/site/live-stats";
import { Reveal, RevealWords, ScrollProgress, Tilt } from "@/components/site/reveal";
import { AIRCRAFT_PATH } from "@/lib/aircraft";
import { COMPANY } from "@/lib/constants";
import { daysAwaySwahili, flightTone, SWAHILI_DAYS, upcomingFlights } from "@/lib/flights";
import { IMAGES, img, marketImage } from "@/lib/imagery";
import { ARTICLES } from "@/lib/learn";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";

/*
 * The homepage (owner, 16 Nov 2026). The scene first, then a page that belongs
 * to it: every section sits on the site's sky (see `.site-sky`) and follows
 * the day/night switch through the theme tokens, which are Target's own navy,
 * red and white.
 *
 * What it has to say, in the order a trader needs it: this company buys in
 * China for you and flies it home. So the page is mostly photographs, with few
 * words and the everyday ones (Warehouse, Supplier, Address: the words the
 * customers themselves use, not their dictionary Swahili). Sourcing and the
 * China markets carry the middle of the page because that is the business:
 * the more a customer buys in China, the more there is to fly. The detail
 * lives on the pages each section links to.
 *
 * The flights and the markets move, so the page is rebuilt hourly rather than
 * frozen at the last deploy.
 */
export const revalidate = 3600;

/** What the business does, in order. A real sequence, so it is numbered. */
const JOURNEY = [
  { title: "Tunatafuta bidhaa", sub: "Sourcing China", image: IMAGES.boutique },
  { title: "Warehouse Guangzhou", sub: "Tunapima na kupiga picha", image: IMAGES.warehouseFloor },
  { title: "Ndege kwenda Dar", sub: "Mara 3 kila wiki", image: IMAGES.planeInSky },
  { title: "Unachukua Dar", sub: "Kwa QR yako", image: IMAGES.parcelHandover },
];

/** How buying for a customer goes, as the sourcing page tells it. */
const SOURCING = [
  "Tuma picha, link au maelezo ya bidhaa",
  "Tunatafuta Supplier na kukagua bidhaa",
  "Unakubali bei kabla hatujanunua",
  "Tunapiga picha Warehouse, kisha inaruka",
];

/** Three guides for someone about to buy, each with a photograph of its subject. */
const GUIDES = [
  { slug: "choosing-a-supplier", image: IMAGES.paperwork },
  { slug: "paying-suppliers", image: IMAGES.payingOnline },
  { slug: "first-import-checklist", image: IMAGES.cargoHold },
]
  .map((g) => ({ ...g, article: ARTICLES.find((a) => a.slug === g.slug) }))
  .filter((g): g is typeof g & { article: (typeof ARTICLES)[number] } => Boolean(g.article));

const WHATSAPP = `https://wa.me/${COMPANY.whatsapp}`;
const NAVY = "#182A48"; // Target's navy, from the logo; the red is the `signal` token

function Eyebrow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.24em] text-signal", className)}>
      <span aria-hidden className="h-px w-7 bg-signal" />
      {children}
    </p>
  );
}
const TITLE = "font-display text-[1.75rem] font-bold leading-[1.1] tracking-tight sm:text-[2.6rem]";
const MORE = "inline-flex items-center gap-1.5 text-sm font-semibold text-brand underline-offset-4 hover:underline";
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
    select: { slug: true, name: true, city: true, bestFor: true },
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

      {/* ---- What we do: four pictures, in order ---- */}
      <section className="section relative">
        <div className="container">
          <Reveal>
            <Eyebrow>Tunafanya nini</Eyebrow>
          </Reveal>
          <RevealWords text="Kutoka sokoni China, hadi mkononi mwako." className={cn(TITLE, "mt-4 max-w-xl")} />

          {/* The route itself: the plane flies it as the page is scrolled. */}
          <ScrollProgress as="ol" mode="centre" className="route mt-10 space-y-10 md:mt-14 md:space-y-16">
            <div aria-hidden className="route-line">
              <span className="route-flown" />
              <span className="route-plane">
                <svg viewBox="-18 -18 36 36">
                  <path d={AIRCRAFT_PATH} transform="rotate(90)" fill="currentColor" />
                </svg>
              </span>
            </div>
            {JOURNEY.map((step, i) => (
              <li key={step.title} className="route-stop grid grid-cols-1 items-center gap-x-24 gap-y-4 md:grid-cols-2">
                <span aria-hidden className="route-node max-md:top-[42%]" />
                <Reveal className={cn(i % 2 === 1 && "md:order-2")}>
                  <Tilt className="aspect-[16/10] overflow-hidden rounded-2xl bg-[hsl(var(--ink))] shadow-lift">
                    <Image src={img(step.image, 900)} alt="" fill sizes="(min-width: 768px) 40vw, 90vw" className="object-cover" />
                  </Tilt>
                </Reveal>
                <Reveal delay={90} className={cn(i % 2 === 1 && "md:order-1 md:text-right")}>
                  <p className="font-display text-sm font-bold tabular text-signal">0{i + 1}</p>
                  <h3 className="mt-1 font-display text-xl font-bold leading-tight tracking-tight sm:text-3xl">{step.title}</h3>
                  <p className="mt-1.5 text-[15px] text-muted-foreground">{step.sub}</p>
                </Reveal>
              </li>
            ))}
          </ScrollProgress>
        </div>
      </section>

      {/* ---- Sourcing: the company buys for you ---- */}
      <section id="sourcing" className="section relative">
        <div className="container grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div>
            <Reveal>
              <Eyebrow>Sourcing China</Eyebrow>
            </Reveal>
            <RevealWords
              text="Huwezi kwenda China? Tunanunua kwa niaba yako."
              accent={{ from: 3, className: "text-signal" }}
              className={cn(TITLE, "mt-4")}
            />
            <Reveal delay={80}>
              <p className="mt-4 max-w-md text-[15px] leading-relaxed text-muted-foreground">
                Timu yetu iko Guangzhou. Tuambie unachotaka, sisi tunamaliza kazi yote hadi mzigo ufike Dar.
              </p>
            </Reveal>

            <ol className="mt-7 space-y-3">
              {SOURCING.map((line, i) => (
                <Reveal as="li" key={line} delay={120 + i * 70} className="flex items-center gap-3.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand font-display text-sm font-bold text-brand-foreground">{i + 1}</span>
                  <span className="text-[15px] font-medium">{line}</span>
                </Reveal>
              ))}
            </ol>

            <Reveal delay={200} className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/services/sourcing"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#D81E2A] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgba(216,30,42,0.8)] transition-[filter] hover:brightness-110"
              >
                Tuma ombi la bidhaa
                <ArrowRight className="size-4" />
              </Link>
              <a
                href={WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-brand/30 bg-card/70 px-5 text-sm font-semibold transition-colors hover:bg-card"
              >
                <MessageCircle className="size-4" />
                WhatsApp
              </a>
            </Reveal>
          </div>

          {/* What people ask us to buy: three photographs, each moving a little apart from the page. */}
          <ScrollProgress className="grid grid-cols-[1.15fr_1fr] gap-3 sm:gap-4">
            <div className="lag row-span-2 min-h-[21rem] sm:min-h-[30rem]" style={{ "--lag": "36px" } as React.CSSProperties}>
              <Tilt className="h-full overflow-hidden rounded-2xl bg-muted shadow-lift">
                <Image src={img(IMAGES.clothesShop, 900)} alt="" fill sizes="(min-width: 1024px) 30vw, 55vw" className="object-cover" />
                <Tag>Nguo</Tag>
              </Tilt>
            </div>
            <div className="lag min-h-[10rem]" style={{ "--lag": "-28px" } as React.CSSProperties}>
              <Tilt className="h-full overflow-hidden rounded-2xl bg-muted shadow-lift">
                <Image src={img(IMAGES.sneakerPair, 700)} alt="" fill sizes="(min-width: 1024px) 25vw, 45vw" className="object-cover" />
                <Tag>Viatu</Tag>
              </Tilt>
            </div>
            <div className="lag min-h-[10rem]" style={{ "--lag": "-64px" } as React.CSSProperties}>
              <Tilt className="h-full overflow-hidden rounded-2xl bg-muted shadow-lift">
                <Image src={img(IMAGES.gadgetsDesk, 700)} alt="" fill sizes="(min-width: 1024px) 25vw, 45vw" className="object-cover" />
                <Tag>Electronics</Tag>
              </Tilt>
            </div>
          </ScrollProgress>
        </div>
      </section>

      {/* ---- China's markets: tall photographs in a row ---- */}
      {markets.length > 0 ? (
        <ScrollProgress as="section" mode="pin" className="run-pin relative">
          <div className="run-stick py-16 md:py-20 lg:py-0">
            <div className="container flex flex-wrap items-end justify-between gap-4">
              <div>
                <Reveal>
                  <Eyebrow>Nunua China</Eyebrow>
                </Reveal>
                <RevealWords text="Masoko ya China." className={cn(TITLE, "mt-4")} />
              </div>
              <Link href="/china/markets" className={MORE}>
                Masoko yote {allMarkets.length} <ArrowRight className="size-4" />
              </Link>
            </div>

            <div className="run-view mt-8 lg:mt-10">
              <ul className={cn("run-track flex w-max snap-x snap-mandatory scroll-px-4 gap-3 pb-2 sm:gap-5 lg:snap-none", EDGE)}>
                {markets.map((m, i) => (
                  <li key={m.slug} className="snap-start">
                    <Tilt className="rounded-2xl">
                      <Link
                        href={`/china/markets#${m.slug}`}
                        className="group relative block h-[23rem] w-[15.5rem] overflow-hidden rounded-2xl bg-[hsl(var(--ink))] shadow-lift sm:h-[27rem] sm:w-[19rem] lg:h-[min(31rem,60vh)] lg:w-[21rem]"
                      >
                        <Image
                          src={img(marketImage(m.slug), 700)}
                          alt=""
                          fill
                          sizes="21rem"
                          className="object-cover transition-transform duration-700 group-hover:scale-[1.05] motion-reduce:transition-none"
                        />
                        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#0b1526]/95 via-[#0b1526]/15 to-[#0b1526]/35" />
                        <span className="absolute left-5 top-5 font-mono text-[11px] tabular text-white/80">
                          {String(i + 1).padStart(2, "0")} / {String(markets.length).padStart(2, "0")}
                        </span>
                        <ArrowRight className="absolute right-5 top-5 size-4 -translate-x-1 text-white opacity-0 transition-[opacity,transform] duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
                        <span className="absolute inset-x-0 bottom-0 p-5 text-white">
                          <span className="flex items-center gap-1.5 text-xs text-white/70">
                            <MapPin className="size-3.5 shrink-0" />
                            {m.city}
                          </span>
                          <span className="mt-2 block font-display text-[1.35rem] font-semibold leading-tight sm:text-2xl">{m.name}</span>
                          <span className="mt-2 line-clamp-2 block text-[13px] leading-snug text-white/70">{m.bestFor}</span>
                        </span>
                      </Link>
                    </Tilt>
                  </li>
                ))}
                <li className="snap-start">
                  <Link
                    href="/china/markets"
                    className="group flex h-[23rem] w-[13rem] flex-col justify-between rounded-2xl p-6 text-white shadow-lift sm:h-[27rem] sm:w-[15rem] lg:h-[min(31rem,60vh)]"
                    style={{ backgroundColor: NAVY }}
                  >
                    <span className="font-display text-6xl font-bold tabular">{allMarkets.length}</span>
                    <span>
                      <span className="block font-display text-2xl font-semibold leading-tight">Masoko yote ya China</span>
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
      <section id="china" className="relative isolate overflow-hidden py-20 text-white md:py-28" style={{ backgroundColor: NAVY }}>
        <Image src={img(IMAGES.warehouseAisle, 2000)} alt="" fill sizes="100vw" className="ken-burns -z-20 object-cover opacity-25 mix-blend-luminosity" />
        <div aria-hidden className="absolute inset-0 -z-10" style={{ background: `radial-gradient(ellipse 60% 70% at 50% 50%, transparent, ${NAVY})` }} />
        <div className="container">
          <div className="mx-auto max-w-xl text-center">
            <Reveal>
              <Eyebrow className="justify-center text-white/75 [&>span]:bg-[#ff3140]">Address ya China</Eyebrow>
            </Reveal>
            <RevealWords text="Mpe Supplier wako address hii." className="mt-4 text-balance font-display text-2xl font-bold leading-tight tracking-tight sm:text-4xl" />
            <Reveal delay={120}>
              <p className="mt-6 rounded-2xl border border-white/15 bg-white/[0.06] px-5 py-4 text-lg font-semibold leading-relaxed backdrop-blur-md">{COMPANY.chinaOffice.addressCn}</p>
              <p className="mt-2 text-sm text-white/60">{COMPANY.chinaOffice.rooms}</p>
              <Link
                href="/china"
                className="mt-7 inline-flex h-11 items-center gap-2 rounded-xl bg-[#D81E2A] px-5 text-sm font-semibold text-white shadow-[0_10px_24px_-10px_rgba(216,30,42,0.8)] transition-[filter] hover:brightness-110"
              >
                Pata address kamili
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
            <div>
              <Reveal>
                <Eyebrow>Ratiba</Eyebrow>
              </Reveal>
              <RevealWords text="Ndege zinazofuata." className={cn(TITLE, "mt-4")} />
            </div>
            <Link href="/schedule" className={MORE}>
              Ratiba kamili <ArrowRight className="size-4" />
            </Link>
          </div>

          {/* The day the plane leaves, and the day the cargo must be in
              Guangzhou — the deadline a customer can still miss. */}
          <ul className="mt-9 grid gap-3 md:grid-cols-3">
            {flights.map((f, i) => {
              const tone = flightTone(f);
              return (
                <Reveal
                  as="li"
                  key={f.departsAt.toISOString()}
                  delay={i * 90}
                  className={cn("rounded-2xl border bg-card p-5 shadow-soft transition-shadow hover:shadow-lift", tone === "urgent" && "border-signal/50")}
                >
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
                  <p className="mt-4 font-display text-2xl font-semibold">
                    {SWAHILI_DAYS[f.departsAt.getDay()]} <span className="text-muted-foreground">{date(f.departsAt)}</span>
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Mzigo ufike Guangzhou kabla ya {SWAHILI_DAYS[f.cutOffAt.getDay()]} {date(f.cutOffAt)}
                  </p>
                </Reveal>
              );
            })}
          </ul>

          <Reveal delay={120}>
            <Link
              href="/book"
              className="mt-8 inline-flex h-11 items-center gap-2 rounded-xl bg-brand px-5 text-sm font-semibold text-brand-foreground transition-[filter] hover:brightness-110"
            >
              Book mzigo wako
              <ArrowRight className="size-4" />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ---- Before you buy: three guides ---- */}
      {GUIDES.length > 0 ? (
        <section className="section relative pt-0 md:pt-0">
          <div className="container">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <Reveal>
                  <Eyebrow>Miongozo</Eyebrow>
                </Reveal>
                <RevealWords text="Jifunze kabla ya kununua." className={cn(TITLE, "mt-4")} />
              </div>
              <Link href="/learn" className={MORE}>
                Miongozo yote <ArrowRight className="size-4" />
              </Link>
            </div>

            <ul className="-mx-4 mt-9 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] md:mx-0 md:grid md:grid-cols-3 md:gap-5 md:overflow-visible md:px-0 [&::-webkit-scrollbar]:hidden">
              {GUIDES.map((g, i) => (
                <Reveal as="li" key={g.slug} delay={i * 90} className="w-[78%] shrink-0 snap-start sm:w-[46%] md:w-auto">
                  <Link href={`/learn/${g.slug}`} className="group flex h-full flex-col overflow-hidden rounded-2xl border bg-card shadow-soft transition-shadow hover:shadow-lift">
                    <span className="relative block aspect-[16/9] overflow-hidden bg-muted">
                      <Image
                        src={img(g.image, 800)}
                        alt=""
                        fill
                        sizes="(min-width: 768px) 33vw, 78vw"
                        className="object-cover transition-transform duration-700 group-hover:scale-[1.05] motion-reduce:transition-none"
                      />
                    </span>
                    <span className="flex flex-1 flex-col p-5">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-signal">{g.article.category}</span>
                      <span className="mt-2 block font-display text-lg font-semibold leading-snug">{g.article.title}</span>
                      <span className="mt-auto flex items-center justify-between pt-4 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="size-3.5" />
                          {g.article.readMinutes} min
                        </span>
                        <ArrowRight className="size-4 text-brand transition-transform group-hover:translate-x-1" />
                      </span>
                    </span>
                  </Link>
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ---- One last line: a Target red band, the wing faint in it ---- */}
      <section className="relative isolate -mb-20 overflow-hidden bg-[#D81E2A] py-20 text-white md:py-28">
        <Image src={img(IMAGES.wingClouds, 2000)} alt="" fill sizes="100vw" className="ken-burns -z-20 object-cover opacity-30 mix-blend-multiply" />
        <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-[#D81E2A] via-[#D81E2A]/80 to-transparent" />
        <div className="container">
          <RevealWords text="Unatuma mzigo mwezi huu?" className="max-w-lg text-balance font-display text-3xl font-bold leading-[1.05] tracking-tight sm:text-5xl" />
          <Reveal delay={150} className="mt-8 flex flex-wrap gap-3">
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-[#D81E2A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.45)] transition-colors hover:bg-white/90"
            >
              <MessageCircle className="size-4" />
              WhatsApp
            </a>
            <Link href="/contact" className="inline-flex h-11 items-center rounded-xl border border-white/50 px-5 text-sm font-semibold transition-colors hover:bg-white/10">
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
    <span className="absolute bottom-3 left-3 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold text-[#182A48] shadow-soft">{children}</span>
  );
}
