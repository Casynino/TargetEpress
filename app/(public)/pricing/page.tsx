import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Info, Plane, Scale } from "lucide-react";

import { PriceLookup, type PriceRow } from "@/components/site/price-lookup";
import { Button } from "@/components/ui/button";
import { COMPANY, STORAGE_POLICY } from "@/lib/constants";
import { toNumber } from "@/lib/format";
import { currentRateValue } from "@/lib/fx";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Price list",
  description:
    "What it costs to fly your goods from China to Dar es Salaam — the full Target Express price list, by product.",
};

// Prices change when the CEO publishes a change, not on a timer. Revalidating
// hourly keeps the public list honest without rebuilding the site.
export const revalidate = 3600;

/**
 * The public price list.
 *
 * Read straight from the rate book, so it cannot drift from what the system
 * actually charges — the failure mode of a hand-written price page is a
 * customer arriving with a screenshot of a rate you stopped using in March.
 */
export default async function PricingPage() {
  const [rules, rate] = await Promise.all([
    prisma.pricingRule.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { minWeightKg: "asc" }],
      include: { cargoType: { select: { name: true, category: true } } },
    }),
    currentRateValue(),
  ]);

  const rows: PriceRow[] = rules.map((rule) => ({
    id: rule.id,
    product: rule.cargoType?.name ?? null,
    category: rule.category,
    method: rule.method,
    price: toNumber(rule.price),
    currency: rule.currency,
    minWeightKg: rule.minWeightKg === null ? null : toNumber(rule.minWeightKg),
    maxWeightKg: rule.maxWeightKg === null ? null : toNumber(rule.maxWeightKg),
    notes: rule.notes,
  }));

  return (
    <div className="container py-12 md:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-signal">
          Bei zetu
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
          What will it cost?
        </h1>
        <p className="mt-4 text-muted-foreground">
          Type what you are sending. This is the same price list the system bills
          from — not a brochure that goes out of date.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-4xl">
        <PriceLookup rows={rows} exchangeRate={rate} />
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
        {[
          {
            icon: Scale,
            title: "Weighed in China",
            body: "Your cargo is weighed when we receive it in Guangzhou or Hong Kong. That weight is what appears on your invoice — we do not re-weigh in Dar and charge you more.",
          },
          {
            icon: Plane,
            title: "Route follows the goods",
            body: "Normal goods fly from Guangzhou. Electronics and special goods fly from Hong Kong. You do not choose — the type of cargo decides, and so does the rate.",
          },
          {
            icon: Info,
            title: `${STORAGE_POLICY.freeDays} days free storage`,
            body: `After ${STORAGE_POLICY.freeDays} days in our Dar warehouse, storage is USD ${STORAGE_POLICY.perDayUsd} per day per shipment. Collect on time and you never see this charge.`,
          },
        ].map((item) => (
          <div key={item.title} className="rounded-xl border bg-card p-5 shadow-soft">
            <item.icon className="h-5 w-5 text-brand" />
            <h2 className="mt-3 font-display font-semibold">{item.title}</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </div>

      <section className="mx-auto mt-12 max-w-3xl rounded-2xl border bg-card p-8 text-center shadow-soft">
        <h2 className="font-display text-2xl font-bold">
          Not sure which category your goods fall in?
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
          Send us a photo of what you are buying before you pay for it. We will
          tell you the category, the route and the price — and whether the airline
          will even accept it.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg" variant="brand" className="rounded-xl">
            <a
              href={`https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(
                "Habari Target Express, nataka kujua bei ya mzigo wangu."
              )}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ask on WhatsApp
              <ArrowRight className="ml-2 h-4 w-4" />
            </a>
          </Button>
          <Button asChild size="lg" variant="outline" className="rounded-xl">
            <Link href="/calculator">Work out a full quote</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
