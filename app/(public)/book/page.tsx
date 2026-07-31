import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, PackageCheck, Plane, Warehouse } from "lucide-react";

import { FlightSchedule } from "@/components/site/flight-schedule";
import { BookingForm } from "@/components/site/request-forms";
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
      <section className="relative overflow-hidden bg-[hsl(var(--ink))] py-20 text-white sm:py-28">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/20 via-transparent to-signal/10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-brand/20 blur-3xl"
        />
        <div className="container relative">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
              Book a shipment
            </p>
            <h1 className="mt-3 font-display text-4xl font-bold leading-[1.08] sm:text-5xl">
              Tell us it is coming.
              <br />
              We will do the rest.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/70">
              No account, no deposit, nothing charged. Send us the details and we
              will reply with where to deliver your cargo in Guangzhou and what
              it will cost once we have weighed it.
            </p>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <div
                key={step.title}
                className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/20 text-brand">
                    <step.icon className="h-4 w-4" />
                  </span>
                  <span className="font-mono text-xs text-white/40">
                    0{index + 1}
                  </span>
                </div>
                <h2 className="mt-4 font-display text-base font-bold">
                  {step.title}
                </h2>
                <p className="mt-1.5 text-sm text-white/60">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-[hsl(var(--ink))] pb-20 text-white sm:pb-28">
        <div className="container grid gap-10 lg:grid-cols-[1.15fr_1fr]">
          <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8">
            <h2 className="font-display text-2xl font-bold">Your booking</h2>
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
              <h2 className="font-display text-xl font-bold">Next departures</h2>
              <p className="mt-1.5 text-sm text-white/60">
                We fly every Wednesday, Friday and Sunday.
              </p>
              <FlightSchedule className="mt-5 sm:grid-cols-1" />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
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

            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
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
