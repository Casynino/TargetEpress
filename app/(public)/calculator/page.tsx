import Link from "next/link";
import type { Metadata } from "next";
import { HelpCircle, Package, Scale, Timer } from "lucide-react";

import { RateCalculator } from "@/components/site/rate-calculator";
import { Button } from "@/components/ui/button";
import { cargoTypesByCategory } from "@/lib/pricing";

export const metadata: Metadata = {
  title: "Kikokotoo cha bei · Shipping calculator",
  description:
    "Estimate the cost of shipping your cargo by air from Guangzhou or Hong Kong to Dar es Salaam, with the chargeable weight worked out for you.",
};

export default async function CalculatorPage() {
  const typesByCategory = await cargoTypesByCategory();

  return (
    <div className="container py-12 md:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-signal">
          Kikokotoo cha bei
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Jua bei kabla ya kutuma
        </h1>
        <p className="mt-4 text-muted-foreground">
          Weka uzito na aina ya mzigo wako, tuonyeshe bei ya makadirio na
          hesabu yote.
          <span className="mt-2 block text-sm">
            Estimate your shipping cost before your supplier ships. We show the
            chargeable weight and the arithmetic, so nothing is a surprise at the
            counter.
          </span>
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-6xl">
        <RateCalculator typesByCategory={typesByCategory} />
      </div>

      {/* How pricing works — pre-empts the questions the calculator provokes */}
      <section className="mx-auto mt-16 max-w-5xl">
        <h2 className="font-display text-2xl font-bold tracking-tight">
          Bei inahesabiwaje?
        </h2>
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {[
            {
              icon: Scale,
              title: "Uzito unaolipiwa",
              body: "Air cargo is billed on the greater of scale weight and volumetric weight. A light but bulky load takes up space we cannot sell twice, so it is priced on the space.",
            },
            {
              icon: Package,
              title: "Aina ya mzigo",
              body: "Electronics, cosmetics and other sensitive categories carry different rates from general merchandise. The calculator applies the rate for the type you pick.",
            },
            {
              icon: Timer,
              title: "Huduma",
              body: "Standard air cargo travels on the next batch. Express is prioritised onto the next available flight and costs more per kilogram.",
            },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="panel p-6">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {body}
              </p>
            </div>
          ))}
        </div>

        <div className="panel mt-6 flex flex-wrap items-center justify-between gap-4 p-6">
          <div className="flex items-start gap-3">
            <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-signal" />
            <div>
              <p className="font-medium">Cargo hard to price?</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Odd shapes, high value, or something you are unsure we can fly —
                send us a photo and we will tell you straight away.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/china">Anwani ya China</Link>
            </Button>
            <Button asChild variant="signal" className="rounded-xl">
              <Link href="/contact">Wasiliana nasi</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
