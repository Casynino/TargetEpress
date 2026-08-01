import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ArrowRight, Clock, Info } from "lucide-react";

import { ARTICLES, articleBySlug } from "@/lib/learn";

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
      <section className="relative overflow-hidden bg-[hsl(var(--ink))] py-16 text-white sm:py-20">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/25 via-transparent to-transparent"
        />
        <div className="container relative max-w-3xl">
          <Link
            href="/learn"
            className="inline-flex items-center gap-1.5 text-sm text-white/60 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            All guides
          </Link>
          <p className="mt-6 text-xs font-semibold uppercase tracking-[0.2em] text-gold">
            {article.category}
          </p>
          <h1 className="mt-3 font-display text-3xl font-bold leading-[1.12] sm:text-4xl">
            {article.title}
          </h1>
          <p className="mt-4 text-lg text-white/70">{article.summary}</p>
          <p className="mt-5 inline-flex items-center gap-1.5 text-sm text-white/50">
            <Clock className="h-4 w-4" />
            {article.readMinutes} minute read
          </p>
        </div>
      </section>

      <article className="section">
        <div className="container max-w-3xl">
          {article.body.map((block, index) => {
            if (block.kind === "h") {
              return (
                <h2
                  key={index}
                  className="mt-10 font-display text-xl font-bold tracking-tight first:mt-0"
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

          <div className="mt-14 rounded-2xl border bg-muted/30 p-6">
            <h2 className="font-display text-lg font-bold">
              Ready to send something?
            </h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Book a shipment and we will tell you where to have it delivered in
              Guangzhou.
            </p>
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                href="/book"
                className="inline-flex items-center gap-2 rounded-xl bg-signal px-5 py-2.5 text-sm font-semibold text-signal-foreground"
              >
                Book a shipment
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-xl border px-5 py-2.5 text-sm font-medium transition-colors hover:bg-accent"
              >
                Estimate the cost
              </Link>
            </div>
          </div>

          <h2 className="mt-14 font-display text-xl font-bold">Keep reading</h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {others.map((other) => (
              <Link
                key={other.slug}
                href={`/learn/${other.slug}`}
                className="rounded-xl border bg-card p-5 transition-colors hover:border-brand/40"
              >
                <p className="text-xs text-muted-foreground">{other.category}</p>
                <p className="mt-1.5 font-display text-sm font-bold leading-snug">
                  {other.title}
                </p>
              </Link>
            ))}
          </div>
        </div>
      </article>
    </>
  );
}
