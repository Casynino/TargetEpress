import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, MessageCircle } from "lucide-react";

import { MediaBand, MediaCard } from "@/components/site/media-card";
import { Reveal } from "@/components/site/reveal";
import { SectionBackdrop } from "@/components/site/section-backdrop";
import { COMPANY } from "@/lib/constants";
import { IMAGES } from "@/lib/imagery";

export const metadata: Metadata = {
  title: "Huduma / Services",
  description:
    "Air freight from Guangzhou and Hong Kong to Dar es Salaam, supplier sourcing, pickup from your supplier, consolidation, inspection and QR-secured collection.",
};

/**
 * What the company does.
 *
 * A bento grid rather than twelve identical tiles: the two things most people
 * arrive for get the space, and the rest fill in around them. Every card
 * carries a photograph, because a page of icons and paragraphs reads as a form
 * no matter how the grey is adjusted.
 */
const HEADLINE = [
  {
    href: "/book",
    image: IMAGES.apron,
    eyebrow: "The core",
    title: "Air cargo, three times a week",
    body: "Guangzhou and Hong Kong to Dar es Salaam every Wednesday, Friday and Sunday. Your cargo travels in a numbered batch with a full manifest — never 'somewhere in transit'.",
    cta: "Book a shipment",
    size: "wide" as const,
    priority: true,
  },
  {
    href: "/china",
    image: IMAGES.warehouseAisle,
    eyebrow: "China",
    title: "Our own warehouse in Guangzhou",
    body: "Your supplier delivers to our address in your name. We weigh it, photograph it and label it the day it lands.",
    cta: "Get the address",
    size: "tall" as const,
    priority: true,
  },
];

const SERVICES = [
  {
    href: "/pickup",
    image: IMAGES.loadingTruck,
    eyebrow: "Collection",
    title: "Pickup from your supplier",
    body: "Any market or factory in Guangzhou. Your supplier hands the boxes to our driver — no forms, no Chinese needed from you.",
    cta: "Request a pickup",
  },
  {
    href: "/services/sourcing",
    image: IMAGES.clothingRail,
    eyebrow: "Sourcing",
    title: "We find the supplier",
    body: "Tell us the product. We find who makes it, what it costs, and whether they are worth buying from.",
    cta: "Send a request",
  },
  {
    href: "/learn/consolidation",
    image: IMAGES.apron,
    eyebrow: "Consolidation",
    title: "Several orders, one shipment",
    body: "Held free at our warehouse while the rest of your order comes together. One invoice, one collection.",
    cta: "How it works",
  },
  {
    href: "/services/sourcing",
    image: IMAGES.paperwork,
    eyebrow: "Inspection",
    title: "Checked before it flies",
    body: "We open it, check it and photograph it in China. Rejecting goods there costs a fraction of discovering them in Dar.",
    cta: "Ask us to inspect",
  },
  {
    href: "/track",
    image: IMAGES.cargoHold,
    eyebrow: "Tracking",
    title: "Every package, every step",
    body: "From our China counter to the counter in Dar, with the photographs taken along the way.",
    cta: "Track a shipment",
  },
  {
    href: "/china/markets",
    image: IMAGES.electronicsBench,
    eyebrow: "Buying",
    title: "Thirteen China market guides",
    body: "Where to buy what, across Guangzhou, Shenzhen, Yiwu, Foshan and beyond — with real buying advice.",
    cta: "Browse markets",
  },
  {
    href: "/learn",
    image: IMAGES.fabricRolls,
    eyebrow: "Learn",
    title: "Import consultation",
    body: "Guides on weight, suppliers, packing, payment and customs — and a person to ask when they do not cover it.",
    cta: "Read the guides",
  },
  {
    href: "/warehouses",
    image: IMAGES.airportNight,
    eyebrow: "Handling",
    title: "Verified collection",
    body: "Released against a paid pickup note and a scanned code, with the handover photographed.",
    cta: "How collection works",
  },
];

export default function ServicesPage() {
  return (
    <>
      <MediaBand
        image={IMAGES.apron}
        eyebrow="Huduma zetu"
        title="Kila kitu kati ya Supplier wako na duka lako"
        body="Njia moja, namba moja ya kufuatilia. Everything between your supplier's shop and your shop in Dar — handled by people who work for us at both ends."
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/book"
            className="inline-flex items-center gap-2 rounded-xl bg-signal px-5 py-3 text-sm font-semibold text-signal-foreground transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
          >
            Book a shipment
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href={`https://wa.me/${COMPANY.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-sm font-medium transition-colors hover:bg-white/10"
          >
            <MessageCircle className="h-4 w-4" />
            Ask us anything
          </a>
        </div>
      </MediaBand>

      {/* The bento used to sit on flat paper between two photographic bands,
          which made the middle of the page read as a hole. Aurora rather than
          photo: every card in here is `bg-card` with muted body copy, and that
          is dark-on-light — flipping the section to ink would take the whole
          grid down with it. */}
      <section className="section relative isolate">
        <SectionBackdrop variant="aurora" />
        <div className="container">
          {/* Bento: the two things people arrive for, given the room.
              The grid is revealed as one block rather than card by card —
              display:contents on a wrapper would kill the transform, and a
              dozen individually animating cards reads as fidgety anyway. */}
          <Reveal className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {HEADLINE.map((service) => (
              <MediaCard key={service.title} {...service} />
            ))}
          </Reveal>

          <Reveal
            delay={90}
            className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
          >
            {SERVICES.map((service) => (
              <MediaCard key={service.title} {...service} />
            ))}
          </Reveal>
        </div>
      </section>

      <MediaBand
        image={IMAGES.warehouseAisle}
        align="center"
        eyebrow="Hakuna gharama za kujificha"
        title="Not sure which of these you need?"
        body="Send us a photo of what you are buying. We will tell you the category, the airport it flies from, and what it will cost — before you commit to anything."
      >
        <div className="flex flex-wrap justify-center gap-3">
          <a
            href={`https://wa.me/${COMPANY.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-xl bg-signal px-5 py-3 text-sm font-semibold text-signal-foreground transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp {COMPANY.phone}
          </a>
          <Link
            href="/pricing"
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-sm font-medium transition-colors hover:bg-white/10"
          >
            How we price cargo
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </MediaBand>
    </>
  );
}
