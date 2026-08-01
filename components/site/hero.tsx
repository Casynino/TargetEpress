"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  Calculator,
  MessageCircle,
  PackagePlus,
  PackageSearch,
  Plane,
  ShieldCheck,
  Warehouse,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COMPANY } from "@/lib/constants";
import { normaliseCode } from "@/lib/format";

/**
 * Public hero.
 *
 * Structure adapted from the AcmeHero reference (components/ui/acme-hero.tsx):
 * staggered motion entrance and a bordered preview panel with a gradient fade.
 * The content is the company's own promise, in the company's own words —
 * Swahili first, because that is how their customers already talk to them.
 */
export function Hero() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const code = normaliseCode(query);
    if (!code) return;
    router.push(`/track?q=${encodeURIComponent(code)}`);
  }

  return (
    <section className="relative">
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .hero-plane animateMotion { display: none; }
          .hero-plane { opacity: 0; }
        }
      `}</style>
      <div className="container relative">
        <div className="relative overflow-hidden rounded-3xl border bg-brand">
          {/* Air cargo apron, dimmed so the type stays legible */}
          <Image
            src="https://images.unsplash.com/photo-1515780855147-aee414989c82?auto=format&fit=crop&w=1800&q=70"
            alt="Cargo being loaded onto aircraft on the airport apron"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          {/* Dark enough for legible type, light enough that you can still see
              it is an aircraft apron — the photo is the point. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--ink)/0.95)] via-[hsl(var(--brand)/0.82)] to-[hsl(var(--brand)/0.6)]"
          />
          {/* The route, drawn behind the type. Same arc as the section further
              down the page, at a size that reads as texture rather than as a
              diagram — the hero should feel like the route, not explain it. */}
          <svg
            aria-hidden
            viewBox="0 0 600 300"
            preserveAspectRatio="xMidYMid slice"
            className="pointer-events-none absolute inset-0 h-full w-full opacity-50"
          >
            <path
              id="heroRoute"
              d="M -20 250 Q 300 20 620 210"
              fill="none"
              stroke="white"
              strokeOpacity="0.55"
              strokeWidth="1.5"
              strokeDasharray="5 9"
            />
            <g className="hero-plane">
              <path d="M 0 -6 L 14 0 L 0 6 L 3.5 0 Z" fill="white" />
              <animateMotion dur="11s" repeatCount="indefinite" rotate="auto">
                <mpath href="#heroRoute" />
              </animateMotion>
            </g>
          </svg>
          {/* A glow where the cargo lands. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-signal/25 blur-3xl"
          />

          <div className="relative px-5 py-14 text-center sm:px-10 md:py-20">
            <div className="rise">
              <span className="inline-flex items-center gap-2 rounded-full bg-signal px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide text-signal-foreground">
                <Plane className="h-3.5 w-3.5" />
                China → Tanzania · Siku 3
              </span>
            </div>

            <h1 className="rise rise-1 mx-auto mt-6 max-w-4xl font-display text-3xl font-extrabold leading-[1.1] tracking-tight text-brand-foreground sm:text-5xl md:text-6xl">
              Ndani ya siku tatu,
              <br />
              <span className="text-signal">mzigo wako</span> uko mlangoni
            </h1>

            <p className="rise rise-2 mx-auto mt-5 max-w-2xl text-base text-brand-foreground/85 sm:text-lg">
              Tunasafirisha mizigo yako kutoka China hadi Tanzania kwa bei
              nafuu — na unaweza kufuatilia kila hatua.
              <span className="mt-2 block text-sm text-brand-foreground/60">
                Air cargo from Guangzhou to Dar es Salaam. Every package
                tracked from our China warehouse to the moment you collect it.
              </span>
            </p>

            <form
              onSubmit={onSubmit}
              className="rise rise-3 mx-auto mt-8 flex w-full max-w-xl flex-col gap-2 sm:flex-row"
            >
              <div className="relative flex-1">
                <PackageSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Namba ya mzigo — e.g. TX-000123"
                  aria-label="Tracking or batch number"
                  className="h-13 rounded-xl border border-white/15 bg-white/10 pl-9 font-mono text-sm uppercase tabular text-white backdrop-blur placeholder:font-sans placeholder:normal-case placeholder:text-white/40"
                />
              </div>
              <Button
                type="submit"
                variant="signal"
                className="h-12 rounded-xl px-7 font-semibold"
              >
                Fuatilia
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </form>

            <div className="rise rise-4 mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button
                asChild
                className="h-11 rounded-xl bg-background px-5 text-foreground hover:bg-background/90"
              >
                <a
                  href={`https://wa.me/${COMPANY.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  WhatsApp {COMPANY.phone}
                </a>
              </Button>
              {/* The two things a first-time visitor can actually do. Tracking
                  is above, for people who are already customers. */}
              <Button
                asChild
                variant="outline"
                className="h-11 rounded-xl border-brand-foreground/25 bg-transparent px-5 text-brand-foreground hover:bg-brand-foreground/10 hover:text-brand-foreground"
              >
                <Link href="/book">
                  <PackagePlus className="mr-2 h-4 w-4" />
                  Book a shipment
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 rounded-xl border-brand-foreground/25 bg-transparent px-5 text-brand-foreground hover:bg-brand-foreground/10 hover:text-brand-foreground"
              >
                <Link href="/calculator">
                  <Calculator className="mr-2 h-4 w-4" />
                  Calculate cost
                </Link>
              </Button>
            </div>

            <div className="rise rise-5 mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm">
              {[
                { icon: Warehouse, label: "Our own warehouse in Guangzhou" },
                { icon: ShieldCheck, label: "QR-verified collection" },
                {
                  icon: Plane,
                  label: `${COMPANY.instagramFollowers} customers on Instagram`,
                },
              ].map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 text-brand-foreground/70"
                >
                  <Icon className="h-4 w-4 text-signal" />
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Live tracking panel — the acme-hero preview pattern */}
        <div className="rise rise-5 mx-auto -mt-8 w-full max-w-3xl rounded-3xl border bg-muted/30 p-2 sm:-mt-10">
          <div className="relative w-full">
            <div className="relative w-full overflow-hidden rounded-[1.25rem] border bg-background shadow-lift">
              <TrackingPreview />
            </div>
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[35%] rounded-b-[1.25rem] bg-gradient-to-t from-background to-transparent" />
          </div>
        </div>
      </div>
    </section>
  );
}

const PREVIEW_STEPS = [
  { label: "Imepokelewa China", place: "Guangzhou warehouse", done: true },
  { label: "Safarini", place: "China → Tanzania", done: true },
  { label: "Imefika Tanzania", place: "Dar es Salaam warehouse", done: true },
  { label: "Tayari kuchukuliwa", place: "Malipo yamekamilika", done: false },
  { label: "Imechukuliwa", place: "Collected by customer", done: false },
];

function TrackingPreview() {
  return (
    <div className="p-5 text-left sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Mzigo / Shipment
          </p>
          <p className="font-mono text-xl font-semibold tabular">TX-000123</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          Imefika Tanzania
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Batch", value: "BATCH-2026-001" },
          { label: "Kutoka", value: "Guangzhou, China" },
          { label: "Vipande", value: "4" },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-0.5 font-mono text-sm font-medium tabular">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <ol className="mt-5">
        {PREVIEW_STEPS.map((step, i) => (
          <li key={step.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={
                  step.done
                    ? "mt-1 h-2.5 w-2.5 rounded-full bg-signal ring-4 ring-signal/15"
                    : "mt-1 h-2.5 w-2.5 rounded-full border-2 border-muted-foreground/30 bg-background"
                }
              />
              {i < PREVIEW_STEPS.length - 1 ? (
                <span
                  className={
                    step.done
                      ? "my-1 w-px flex-1 bg-signal/40"
                      : "my-1 w-px flex-1 bg-border"
                  }
                />
              ) : null}
            </div>
            <div className="pb-4">
              <p
                className={
                  step.done
                    ? "text-sm font-medium"
                    : "text-sm text-muted-foreground"
                }
              >
                {step.label}
              </p>
              <p className="text-xs text-muted-foreground">{step.place}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
