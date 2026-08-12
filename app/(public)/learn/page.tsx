import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";

import { MediaBand, MediaCard } from "@/components/site/media-card";
import { PageHero } from "@/components/site/page-hero";
import { Reveal } from "@/components/site/reveal";
import { SectionBackdrop } from "@/components/site/section-backdrop";
import { IMAGES } from "@/lib/imagery";
import { ARTICLES, LEARN_CATEGORIES } from "@/lib/learn";

export const metadata: Metadata = {
  title: "Learn importing",
  description:
    "Plain guides to importing from China to Tanzania: how air cargo works, why weight is charged the way it is, choosing suppliers, packing, paying and clearing customs.",
};

/**
 * Which photograph belongs to which guide.
 *
 * Deliberately the same mapping the article page uses, so a guide is the same
 * picture wherever you meet it — in this index, at the top of the article, and
 * in the "keep reading" row at the bottom of another one. A card that changes
 * its photograph between two screens reads as decoration; one that does not
 * reads as the thing itself.
 */
const ARTICLE_IMAGES: Record<string, string> = {
  "how-air-cargo-works": IMAGES.cargoHold,
  "why-weight-is-charged": IMAGES.apron,
  "choosing-a-supplier": IMAGES.clothingRail,
  "packing-for-air-freight": IMAGES.packedCartons,
  "paying-suppliers": IMAGES.paperwork,
  "customs-and-clearing": IMAGES.airportNight,
  "first-import-checklist": IMAGES.apron,
  consolidation: IMAGES.warehouseAisle,
};

function articleImage(slug: string) {
  return ARTICLE_IMAGES[slug] ?? IMAGES.paperwork;
}

export default function LearnPage() {
  return (
    <>
      <PageHero
        image={IMAGES.paperwork}
        eyebrow="Learn importing"
        title="Everything we get asked on WhatsApp, written down."
        body="No sales pitch. These are the questions first-time importers actually ask us — about weight, suppliers, packing, payment and customs — answered the way we would answer them on the phone."
      />

      {/* One section per category rather than four headings stacked inside a
          single flat panel. Each gets its own field behind it, alternating so
          two neighbouring groups never look like the same block repeated. */}
      {LEARN_CATEGORIES.map((category, index) => {
        const articles = ARTICLES.filter((a) => a.category === category);
        if (articles.length === 0) return null;

        return (
          <section
            key={category}
            className="relative isolate border-t py-12 md:py-16"
          >
            <SectionBackdrop variant={index % 2 === 0 ? "aurora" : "stars"} />
            <div className="container">
              <h2 className="rule-gold font-display text-2xl font-bold tracking-tight">
                {category}
              </h2>
              <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                {articles.map((article, cardIndex) => (
                  <Reveal key={article.slug} delay={cardIndex * 60}>
                    <MediaCard
                      className="h-full"
                      href={`/learn/${article.slug}`}
                      image={articleImage(article.slug)}
                      eyebrow={`${article.readMinutes} min read`}
                      title={article.title}
                      body={article.summary}
                      cta="Read"
                    />
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        );
      })}

      {/* The page's closing breath: the same invitation as before, but on a
          photograph instead of a grey box. The button switches to signal
          because brand navy on ink is a button you cannot see. */}
      <MediaBand
        image={IMAGES.loadingTruck}
        align="center"
        title="Still not sure about something?"
        body="Ask us before you buy, not after. It is free and it is the whole reason we know the answers to write these."
      >
        <Link
          href="/contact"
          className="inline-flex items-center gap-2 rounded-xl bg-signal px-5 py-3 text-sm font-semibold text-signal-foreground transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
        >
          Talk to us
          <ArrowRight className="h-4 w-4" />
        </Link>
      </MediaBand>
    </>
  );
}
