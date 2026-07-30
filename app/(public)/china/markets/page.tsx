import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Clock, MapPin, Plane } from "lucide-react";

import { Button } from "@/components/ui/button";
import { COMPANY } from "@/lib/constants";
import { MARKETS } from "@/lib/markets";

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
export default function PublicMarketsPage() {
  return (
    <div className="container py-12 md:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-brand">
          Kununua China
        </p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Where to buy in China
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
          Every trader asks the same question before their first trip: where do I
          actually go? These are the markets our customers buy from, what each
          one is good for, and how your goods get home.
        </p>
      </div>

      <div className="mx-auto mt-10 grid max-w-6xl gap-6 lg:grid-cols-2">
        {MARKETS.map((market) => (
          <article
            key={market.slug}
            className="flex flex-col overflow-hidden rounded-2xl border bg-card shadow-soft transition-shadow hover:shadow-lift"
          >
            <div className="border-b bg-gradient-to-br from-brand/5 to-transparent p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-bold">{market.name}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {market.nameCn}
                  </p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                    market.route === "HONG_KONG"
                      ? "bg-info/10 text-info"
                      : "bg-brand/10 text-brand"
                  }`}
                >
                  <Plane className="h-3 w-3" />
                  via {market.route === "HONG_KONG" ? "Hong Kong" : "Guangzhou"}
                </span>
              </div>
              <p className="mt-3 font-medium text-brand">{market.bestFor}</p>
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
                  {market.hours.split(";")[0]}
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
        ))}
      </div>

      <section className="mx-auto mt-12 max-w-3xl rounded-2xl border bg-card p-8 text-center shadow-soft">
        <h2 className="font-display text-2xl font-bold">
          Can&rsquo;t travel? We can buy for you.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Tell us what you need and your budget. Our team finds the supplier,
          checks the goods, and ships them to Dar es Salaam — you never leave
          Tanzania.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
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
          <Button asChild size="lg" variant="outline" className="rounded-xl">
            <Link href="/calculator">Work out the shipping cost</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
