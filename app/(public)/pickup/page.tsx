import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, MapPin, Timer, Truck } from "lucide-react";

import { PickupForm } from "@/components/site/request-forms";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Pick up my package",
  description:
    "We collect cargo from your supplier anywhere in Guangzhou and bring it to our warehouse for the next flight to Dar es Salaam.",
};

const POINTS = [
  {
    icon: Truck,
    title: "Anywhere in Guangzhou",
    body: "Baima, Shahe, Huaqiangbei, a factory in Foshan — give us the address and we will be there.",
  },
  {
    icon: MapPin,
    title: "Your supplier does nothing",
    body: "They hand the boxes to our driver. No forms, no Chinese needed from you.",
  },
  {
    icon: Timer,
    title: "Straight onto the next flight",
    body: "Collected cargo is weighed, photographed and labelled the same day it reaches our warehouse.",
  },
];

export default function PickupPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-[hsl(var(--ink))] py-20 text-white sm:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-bl from-signal/15 via-transparent to-brand/20"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-32 top-10 h-96 w-96 rounded-full bg-signal/15 blur-3xl"
        />
        <div className="container relative grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
              Pick up my package
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold leading-[1.08] sm:text-5xl">
              Your supplier has it.
              <br />
              We will go and get it.
            </h1>
            <p className="mt-5 max-w-lg text-lg text-white/70">
              Send us the address and our Guangzhou team collects your cargo,
              brings it to our warehouse and puts it on the next flight out.
            </p>

            <ul className="mt-9 space-y-5">
              {POINTS.map((point) => (
                <li key={point.title} className="flex gap-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 text-brand">
                    <point.icon className="h-4.5 w-4.5" />
                  </span>
                  <span>
                    <span className="block font-display font-bold">
                      {point.title}
                    </span>
                    <span className="mt-0.5 block text-sm text-white/60">
                      {point.body}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 backdrop-blur sm:p-8">
            <h2 className="font-display text-2xl font-bold">Where should we go?</h2>
            <p className="mt-1.5 text-sm text-white/60">
              A Google Maps pin is the fastest way to get us to the right door.
            </p>
            <div className="mt-7">
              <PickupForm />
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-white/10 bg-[hsl(var(--ink))] py-14 text-white">
        <div className="container flex flex-wrap items-center justify-between gap-6">
          <div>
            <h2 className="font-display text-xl font-bold">
              Already know what you are sending?
            </h2>
            <p className="mt-1 text-sm text-white/60">
              Book the shipment and tick the collection box — one form instead of
              two.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/book"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-[hsl(var(--ink))] transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
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
              WhatsApp us
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
