import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Clock, MapPin, Plane } from "lucide-react";

import { MediaBand } from "@/components/site/media-card";
import { PageHero } from "@/components/site/page-hero";
import { Reveal } from "@/components/site/reveal";
import { SectionBackdrop } from "@/components/site/section-backdrop";
import { Button } from "@/components/ui/button";
import { COMPANY } from "@/lib/constants";
import { IMAGES, img, marketImage } from "@/lib/imagery";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "China wholesale markets",
  description:
    "The wholesale markets Tanzanian traders buy from in China — what each one sells, where it is, and how the goods fly home with Target Express.",
};

/**
 * The public markets guide.
 *
 * Same source of truth as the support desk's directory, written for the person
 * planning the trip rather than the clerk answering the phone. The route badge
 * is the commercially useful part: it tells a trader, before they buy, which
 * airport their goods leave from and therefore roughly what they will pay.
 */
export const revalidate = 3600;

export default async function PublicMarketsPage() {
  const markets = await prisma.chinaMarket.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <>
      <PageHero
        image={IMAGES.clothingRail}
        eyebrow="Kununua China"
        title="Where to buy in China"
        body="Every trader asks the same question before their first trip: where do I actually go? These are the markets our customers buy from, what each one is good for, and how your goods get home."
        size="tall"
      />

      {/* Thirteen markets is too many to scroll past looking for one. Each card
          gets an anchor and this jumps to it — cheaper than splitting the
          directory into thirteen pages that would compete with each other for
          the same search terms. */}
      <section className="relative isolate border-b py-8 md:py-10">
        <SectionBackdrop variant="aurora" />
        <div className="container">
          <nav
            aria-label="Jump to a market"
            className="mx-auto flex max-w-5xl flex-wrap justify-center gap-2"
          >
            {markets.map((market) => (
              <a
                key={market.id}
                href={`#${market.slug}`}
                className="rounded-full border bg-card/70 px-3.5 py-1.5 text-xs font-medium backdrop-blur transition-colors hover:border-gold/50 hover:bg-accent"
              >
                {market.name}
              </a>
            ))}
          </nav>
        </div>
      </section>

      <section className="section relative isolate">
        <SectionBackdrop variant="stars" />
        <div className="container">
          <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
            {markets.map((market, index) => (
              <Reveal key={market.id} className="h-full" delay={(index % 2) * 80}>
                <article
                  id={market.slug}
                  className="group flex h-full scroll-mt-24 flex-col overflow-hidden rounded-2xl border bg-card shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-gold/50 hover:shadow-lift motion-reduce:hover:translate-y-0"
                >
                  {/* The photograph is what tells you a fabric market from a shoe
                      market before you have read a word of it — so it carries the
                      name and the route badge rather than sitting above them. */}
                  <div className="relative h-52 overflow-hidden sm:h-56">
                    <Image
                      src={img(marketImage(market.slug), 900)}
                      alt=""
                      fill
                      sizes="(max-width: 1024px) 100vw, 50vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                    <div
                      aria-hidden
                      className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--ink)/0.94)] via-[hsl(var(--ink)/0.38)] to-[hsl(var(--ink)/0.1)]"
                    />
                    {/* White type on the scrim rather than the route colour: at this
                        size a mid-blue on a photograph is a legibility gamble, so the
                        route reads in the border and the wing instead. */}
                    <span
                      className={`absolute left-4 top-4 inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-[hsl(var(--ink)/0.62)] px-3 py-1 text-xs font-medium text-white backdrop-blur ${
                        market.route === "HONG_KONG"
                          ? "border-info/60"
                          : "border-gold/50"
                      }`}
                    >
                      <Plane
                        className={`h-3 w-3 ${
                          market.route === "HONG_KONG" ? "text-info" : "text-gold"
                        }`}
                      />
                      via {market.route === "HONG_KONG" ? "Hong Kong" : "Guangzhou"}
                    </span>
                    <div className="absolute inset-x-4 bottom-3">
                      <h2 className="font-display text-xl font-bold leading-tight text-white drop-shadow">
                        {market.name}
                      </h2>
                      {market.nameCn ? (
                        <p className="mt-0.5 text-sm text-white/75">{market.nameCn}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="border-b bg-gradient-to-br from-brand/5 to-transparent px-6 py-4">
                    <p className="font-medium text-brand">{market.bestFor}</p>
                  </div>

                  <div className="flex-1 space-y-5 p-6">
                    <p className="text-sm text-muted-foreground">{market.summary}</p>

                    <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        {market.city}
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                        <Clock className="h-4 w-4" />
                        {(market.hours ?? "Hours vary").split(";")[0]}
                      </span>
                    </div>

                    <div>
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        What you will find
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {market.products.map((product) => (
                          <span
                            key={product}
                            className="rounded-full border px-2.5 py-1 text-xs"
                          >
                            {product}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg bg-muted/40 p-4">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Before you go
                      </p>
                      <ul className="space-y-1.5 text-sm text-muted-foreground">
                        {market.tips.map((tip) => (
                          <li key={tip} className="flex gap-2">
                            <span className="text-brand">•</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <MediaBand
        image={IMAGES.cargoHold}
        align="center"
        title="Can’t travel? We can buy for you."
        body="Tell us what you need and your budget. Our team finds the supplier, checks the goods, and ships them to Dar es Salaam — you never leave Tanzania."
      >
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" className="rounded-xl">
            <a
              href={`https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(
                "Habari Target Express, nataka msaada wa kutafuta bidhaa China."
              )}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ask us to source it
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="rounded-xl border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            <Link href="/pricing">How we price cargo</Link>
          </Button>
        </div>
      </MediaBand>
    </>
  );
}
