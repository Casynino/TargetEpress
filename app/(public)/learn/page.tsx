import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, BookOpen, Clock } from "lucide-react";

import { Reveal } from "@/components/site/reveal";
import { ARTICLES, LEARN_CATEGORIES } from "@/lib/learn";

export const metadata: Metadata = {
  title: "Learn importing",
  description:
    "Plain guides to importing from China to Tanzania: how air cargo works, why weight is charged the way it is, choosing suppliers, packing, paying and clearing customs.",
};

export default function LearnPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-[hsl(var(--ink))] py-20 text-white sm:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/25 via-transparent to-transparent"
        />
        <div className="container relative">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
            Learn importing
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-[1.08] sm:text-5xl">
            Everything we get asked on WhatsApp, written down.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/70">
            No sales pitch. These are the questions first-time importers
            actually ask us — about weight, suppliers, packing, payment and
            customs — answered the way we would answer them on the phone.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container">
          {LEARN_CATEGORIES.map((category) => {
            const articles = ARTICLES.filter((a) => a.category === category);
            if (articles.length === 0) return null;

            return (
              <div key={category} className="mb-14 last:mb-0">
                <h2 className="font-display text-2xl font-bold tracking-tight">
                  {category}
                </h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {articles.map((article, index) => (
                    <Reveal key={article.slug} delay={index * 60}>
                      <Link
                        href={`/learn/${article.slug}`}
                        className="group flex h-full flex-col rounded-2xl border bg-card p-6 shadow-soft transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift motion-reduce:hover:translate-y-0"
                      >
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Clock className="h-3.5 w-3.5" />
                          {article.readMinutes} min read
                        </span>
                        <h3 className="mt-3 font-display text-lg font-bold leading-snug">
                          {article.title}
                        </h3>
                        <p className="mt-2 flex-1 text-sm text-muted-foreground">
                          {article.summary}
                        </p>
                        <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
                          Read
                          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
                        </span>
                      </Link>
                    </Reveal>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="rounded-2xl border bg-muted/30 p-8 text-center">
            <BookOpen className="mx-auto h-7 w-7 text-brand" />
            <h2 className="mt-4 font-display text-xl font-bold">
              Still not sure about something?
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Ask us before you buy, not after. It is free and it is the whole
              reason we know the answers to write these.
            </p>
            <Link
              href="/contact"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-3 text-sm font-semibold text-brand-foreground transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
            >
              Talk to us
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
