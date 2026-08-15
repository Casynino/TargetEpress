import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Clock, Info } from "lucide-react";

import { MediaBand, MediaCard } from "@/components/site/media-card";
import { PageHero } from "@/components/site/page-hero";
import { SectionBackdrop } from "@/components/site/section-backdrop";
import { IMAGES } from "@/lib/imagery";
import { ARTICLES, articleBySlug } from "@/lib/learn";

/**
 * Which photograph opens which guide.
 *
 * Picked per article rather than one image for the whole section: a piece about
 * customs wants an airport at night, a piece about packing wants cartons. A
 * generic warehouse on all eight would read as decoration, which is the thing
 * the owner keeps objecting to.
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

export function generateStaticParams() {
  return ARTICLES.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = articleBySlug(slug);
  if (!article) return { title: "Guide not found" };
  return {
    title: article.title,
    description: article.summary,
    openGraph: { title: article.title, description: article.summary },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = articleBySlug(slug);
  if (!article) notFound();

  const others = ARTICLES.filter((a) => a.slug !== article.slug).slice(0, 3);

  return (
    <>
      <PageHero
        image={articleImage(article.slug)}
        eyebrow={article.category}
        title={article.title}
        body={article.summary}
      >
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <Link
            href="/learn"
            className="inline-flex items-center gap-1.5 text-sm text-white/70 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            All guides
          </Link>
          <p className="inline-flex items-center gap-1.5 text-sm text-white/50">
            <Clock className="h-4 w-4" />
            {article.readMinutes} minute read
          </p>
        </div>
      </PageHero>

      <article className="section relative isolate">
        {/* Drifting colour only. Anything busier behind three thousand words of
            body copy makes the copy harder to read, which is the one thing an
            article page cannot afford. */}
        <SectionBackdrop variant="aurora" />
        <div className="container max-w-3xl">
          {article.body.map((block, index) => {
            if (block.kind === "h") {
              return (
                <h2
                  key={index}
                  className="rule-gold mt-10 font-display text-xl font-bold tracking-tight first:mt-0"
                >
                  {block.text}
                </h2>
              );
            }
            if (block.kind === "list") {
              return (
                <ul key={index} className="mt-4 space-y-2.5">
                  {block.items.map((item) => (
                    <li key={item} className="flex gap-3 text-[15px] leading-relaxed">
                      <span
                        aria-hidden
                        className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                      />
                      <span className="text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              );
            }
            if (block.kind === "note") {
              return (
                <p
                  key={index}
                  className="mt-8 flex gap-3 rounded-xl border border-brand/25 bg-brand/5 p-5 text-[15px] leading-relaxed"
                >
                  <Info className="mt-0.5 h-4.5 w-4.5 shrink-0 text-brand" />
                  <span>{block.text}</span>
                </p>
              );
            }
            return (
              <p
                key={index}
                className="mt-4 text-[15px] leading-relaxed text-muted-foreground"
              >
                {block.text}
              </p>
            );
          })}
        </div>
      </article>

      {/* The end of the article, lifted out of the column and given a
          photograph — the page's one full-width breath before the next
          three guides. */}
      <MediaBand
        image={IMAGES.loadingTruck}
        eyebrow="Next step"
        title="Ready to send something?"
        body="Book your cargo and we will tell you where to have it delivered in Guangzhou."
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/book"
            className="inline-flex items-center gap-2 rounded-xl bg-signal px-5 py-2.5 text-sm font-semibold text-signal-foreground"
          >
            Book your cargo
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
          >
            Estimate the cost
          </Link>
        </div>
      </MediaBand>

      <section className="section relative isolate border-t">
        <SectionBackdrop variant="stars" />
        <div className="container max-w-5xl">
          <h2 className="rule-gold font-display text-xl font-bold">
            Keep reading
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
            {others.map((other) => (
              <MediaCard
                key={other.slug}
                href={`/learn/${other.slug}`}
                image={articleImage(other.slug)}
                eyebrow={other.category}
                title={other.title}
                body={other.summary}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
