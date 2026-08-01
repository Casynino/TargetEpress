import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, PackageCheck, Plane, Warehouse } from "lucide-react";

import { FlightSchedule } from "@/components/site/flight-schedule";
import { PageHero } from "@/components/site/page-hero";
import { BookingForm } from "@/components/site/request-forms";
import { SectionBackdrop } from "@/components/site/section-backdrop";
import { IMAGES, img } from "@/lib/imagery";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Book a shipment",
  description:
    "Tell us what you are sending from China and we will confirm where to send it, what it will cost and which flight it makes.",
};

const STEPS = [
  {
    icon: PackageCheck,
    title: "You tell us it is coming",
    body: "This form. Two minutes, no account, no payment.",
  },
  {
    icon: Warehouse,
    title: "Your supplier delivers to us",
    body: "We send you our Guangzhou address in your name. We weigh it, photograph it and label it the day it arrives.",
  },
  {
    icon: Plane,
    title: "It flies on the next departure",
    body: "You get a tracking number and follow it from China to the counter in Dar es Salaam.",
  },
];

export default function BookPage() {
  return (
    <>
      <PageHero
        image={IMAGES.cargoHold}
        eyebrow="Book a shipment"
        size="tall"
        title={<>Tell us it is coming.<br />We will do the rest.</>}
        body="No account, no deposit, nothing charged. Send us the details and we will reply with where to deliver your cargo in Guangzhou and what it will cost once we have weighed it."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="glass-dark rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-gold">
                  <step.icon className="h-4 w-4" />
                </span>
                <span className="font-mono text-xs text-gold/70">0{index + 1}</span>
              </div>
              <h2 className="mt-4 font-display text-base font-bold">{step.title}</h2>
              <p className="mt-1.5 text-sm text-white/60">{step.body}</p>
            </div>
          ))}
        </div>
      </PageHero>

      {/* The form itself. A star field rather than flat navy: the page is a
          long scroll of inputs, and the only thing behind them used to be a
          rectangle of one colour. */}
      <section className="relative isolate bg-[hsl(var(--ink))] pb-20 text-white sm:pb-28">
        <SectionBackdrop variant="stars" />

        <div className="container relative grid gap-10 lg:grid-cols-[1.15fr_1fr]">
          <div className="glass-dark rounded-3xl p-6 shadow-lift sm:p-8">
            <h2 className="rule-gold font-display text-2xl font-bold">Your booking</h2>
            <p className="mt-1.5 text-sm text-white/60">
              Everything except your name and number is optional — estimates are
              fine, we weigh it ourselves.
            </p>
            <div className="mt-7">
              <BookingForm />
            </div>
          </div>

          <div className="space-y-8">
            <div>
              <h2 className="rule-gold font-display text-xl font-bold">Next departures</h2>
              <p className="mt-1.5 text-sm text-white/60">
                We fly every Wednesday, Friday and Sunday.
              </p>
              <FlightSchedule className="mt-5 sm:grid-cols-1" />
            </div>

            {/* The two side panels carry photographs now. They sit under the
                flight cards, which are the busiest thing in the column, and a
                plain tinted box after them reads as the page giving up. */}
            <div className="group relative isolate overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 transition-colors duration-300 hover:border-gold/40">
              <Image
                src={img(IMAGES.paperwork, 700)}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 420px"
                className="-z-10 object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
              <div
                aria-hidden
                className="absolute inset-0 -z-10 bg-gradient-to-r from-[hsl(var(--ink)/0.95)] via-[hsl(var(--ink)/0.86)] to-[hsl(var(--ink)/0.6)]"
              />
              <h3 className="font-display text-lg font-bold">
                Prefer to talk first?
              </h3>
              <p className="mt-1.5 text-sm text-white/60">
                Message us on WhatsApp and a person will answer.
              </p>
              <a
                href={`https://wa.me/${COMPANY.whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/10"
              >
                Chat on WhatsApp
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            <div className="group relative isolate overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 transition-colors duration-300 hover:border-gold/40">
              <Image
                src={img(IMAGES.loadingTruck, 700)}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 420px"
                className="-z-10 object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
              <div
                aria-hidden
                className="absolute inset-0 -z-10 bg-gradient-to-r from-[hsl(var(--ink)/0.95)] via-[hsl(var(--ink)/0.86)] to-[hsl(var(--ink)/0.6)]"
              />
              <h3 className="font-display text-lg font-bold">
                Need it collected?
              </h3>
              <p className="mt-1.5 text-sm text-white/60">
                We can pick cargo up from your supplier anywhere in Guangzhou.
              </p>
              <Link
                href="/pickup"
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
              >
                Request a pickup
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
