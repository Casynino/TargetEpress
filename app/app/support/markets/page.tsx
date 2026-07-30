import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Info, MapPin, Plane } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { MARKETS } from "@/lib/markets";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "China markets" };

/**
 * The directory the desk recommends from.
 *
 * Written to be read aloud on a phone call: what the market is for, in one
 * line, then the products, then the practical warnings. Grouped by route
 * because the route decides the price the customer will pay to fly it home.
 */
export default async function MarketsPage() {
  await requirePermission("sourcing.manage");

  return (
    <>
      <PageHeader
        title="China markets"
        description="Where to send a customer for what they are buying — and how it will fly home."
      />

      <div className="mb-6 flex items-start gap-3 rounded-xl border bg-card p-4 text-sm shadow-soft">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-muted-foreground">
          The route matters as much as the market. Goods bought around Guangzhou
          consolidate at our Guangzhou warehouse; electronics from Shenzhen fly
          out of Hong Kong. Telling a customer the wrong one changes what they
          pay.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {MARKETS.map((market) => (
          <article
            key={market.slug}
            className="flex flex-col rounded-xl border bg-card shadow-soft"
          >
            <header className="border-b p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold">{market.name}</h2>
                  <p className="text-sm text-muted-foreground">{market.nameCn}</p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    market.route === "HONG_KONG"
                      ? "border-info/40 text-info"
                      : "border-brand/40 text-brand"
                  }
                >
                  <Plane className="mr-1 h-3 w-3" />
                  {market.route === "HONG_KONG" ? "Hong Kong" : "Guangzhou"}
                </Badge>
              </div>
              <p className="mt-3 text-sm font-medium text-brand">{market.bestFor}</p>
            </header>

            <div className="flex-1 space-y-4 p-5">
              <p className="text-sm text-muted-foreground">{market.summary}</p>

              <dl className="grid gap-2 text-sm">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <dd>
                    {market.city} — {market.district}
                  </dd>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <dd className="text-muted-foreground">{market.hours}</dd>
                </div>
              </dl>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  What they sell
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

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Tell the customer
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

              {market.verify ? (
                <p className="rounded-md border border-warning/30 bg-warning/5 p-2.5 text-xs text-warning">
                  {market.verify}
                </p>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <p className="mt-6 text-sm text-muted-foreground">
        A customer who wants us to do the buying for them becomes a{" "}
        <Link href="/app/support/sourcing" className="text-brand hover:underline">
          sourcing request
        </Link>
        .
      </p>
    </>
  );
}
