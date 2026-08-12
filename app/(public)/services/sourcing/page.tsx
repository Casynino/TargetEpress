import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  Camera,
  HandCoins,
  Plane,
  Search,
  ShieldCheck,
} from "lucide-react";

import { MediaBand } from "@/components/site/media-card";
import { PageHero } from "@/components/site/page-hero";
import { SectionBackdrop } from "@/components/site/section-backdrop";
import { SourcingForm } from "@/components/site/sourcing-form";
import { IMAGES } from "@/lib/imagery";
import { Button } from "@/components/ui/button";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "We buy from China for you",
  description:
    "Cannot travel to China? Target Express finds the supplier, checks the goods and ships them to Dar es Salaam — you never leave Tanzania.",
};

const STEPS = [
  {
    icon: Search,
    title: "You tell us what you want",
    body: "A photo, a link, a description — whatever you have. Quantity and budget help us come back with a real number rather than a guess.",
  },
  {
    icon: BadgeCheck,
    title: "We find it and check the seller",
    body: "Our team is in Guangzhou. We go to the market, see the goods, and confirm the supplier is a real business before any money moves.",
  },
  {
    icon: HandCoins,
    title: "You approve the price",
    body: "We come back with the unit price, the minimum order and what shipping will cost. Nothing is bought until you say yes.",
  },
  {
    icon: Camera,
    title: "We photograph it at our warehouse",
    body: "Your goods arrive at our China warehouse and are photographed before they are packed. You see what you bought before it flies.",
  },
  {
    icon: Plane,
    title: "It flies with your tracking number",
    body: "From there it is a normal Target Express shipment: a tracking number, a QR code, and collection in Dar es Salaam.",
  },
];

/**
 * The sourcing service page.
 *
 * The form is the point of the page, so it sits high rather than at the bottom
 * — a trader who has decided should not have to scroll past our sales pitch to
 * act. Everything below it is for the ones still deciding.
 */
export default function SourcingServicePage() {
  return (
    <>
      <PageHero
        image={IMAGES.clothingRail}
        eyebrow="Tunanunua kwa niaba yako"
        title="Cannot go to China? We will go for you."
        body="Ticket, visa, hotel, a week away from your shop — a buying trip costs more than most orders are worth. Tell us what you need and our team in Guangzhou finds it, checks it and ships it."
      />

      <section className="section relative isolate">
        <SectionBackdrop variant="aurora" />
        <div className="container">
          <div className="mx-auto grid grid-cols-1 max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="order-2 lg:order-1">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            How it works
          </h2>
          <ol className="mt-6 space-y-6">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                    <step.icon className="h-5 w-5" />
                  </span>
                  {index < STEPS.length - 1 ? (
                    <span className="my-2 w-px flex-1 bg-border" />
                  ) : null}
                </div>
                <div className="pb-2">
                  <h3 className="font-display font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex items-start gap-3 rounded-xl border bg-muted/30 p-5">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
            <div>
              <h3 className="font-display font-semibold">
                Why not just pay a supplier directly?
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Plenty of people do, and plenty of people lose the money. If you
                have already found a supplier and only want to know whether they
                are real, ask us to check them — that on its own has saved our
                customers more than we have ever charged for it.
              </p>
            </div>
          </div>

          <div className="mt-8">
            <h3 className="font-display font-semibold">
              Not sure where your goods come from?
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Different goods live in different cities. Our{" "}
              <Link href="/china/markets" className="text-brand hover:underline">
                markets guide
              </Link>{" "}
              shows which market sells what — and which airport it flies out of,
              because that decides your price.
            </p>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <h2 className="mb-4 font-display text-2xl font-bold tracking-tight">
            Tell us what you need
          </h2>
          <SourcingForm />

          <div className="mt-4 rounded-xl border bg-card p-4 text-center text-sm shadow-soft">
            <p className="text-muted-foreground">Rather just talk to someone?</p>
            <Button asChild variant="outline" className="mt-3 w-full rounded-xl">
              <a
                href={`https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(
                  "Habari Target Express, nataka msaada wa kutafuta bidhaa China."
                )}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp {COMPANY.phone}
              </a>
            </Button>
          </div>
          </div>
          </div>
        </div>
      </section>

      <MediaBand
        image={IMAGES.warehouseAisle}
        align="center"
        eyebrow="Kutoka soko hadi duka lako"
        title="You never leave Tanzania."
        body="We find it, check it, photograph it and fly it — and it arrives with the same tracking number as any other shipment."
      />
    </>
  );
}
