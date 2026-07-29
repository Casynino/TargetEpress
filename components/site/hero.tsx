"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import {
  ArrowRight,
  CheckCircle2,
  Plane,
  PackageSearch,
  ShieldCheck,
  Warehouse,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normaliseCode } from "@/lib/format";

/**
 * Public hero.
 *
 * Adapted from the AcmeHero reference (components/ui/acme-hero.tsx): same
 * staggered motion entrance and the same bordered preview panel with a
 * bottom gradient fade. The screenshot is replaced by a live-looking tracking
 * card, because a logistics visitor came here to find their cargo, not to
 * admire a dashboard.
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
    <section className="relative overflow-hidden">
      {/* Ambient brand glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,hsl(var(--brand)/0.16),transparent)]"
      />

      <div className="container relative">
        <div className="flex flex-col items-center space-y-6 py-16 text-center md:py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-flex items-center gap-2 rounded-full border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur">
              <Plane className="h-3.5 w-3.5 text-signal" />
              Guangzhou &amp; Hong Kong → Dar es Salaam
            </span>
          </motion.div>

          <motion.h1
            className="max-w-4xl font-display text-4xl font-bold tracking-tighter sm:text-5xl md:text-6xl lg:text-7xl/[1.05]"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
          >
            Air cargo you can
            <span className="text-brand"> actually follow</span>
          </motion.h1>

          <motion.p
            className="mx-auto max-w-2xl text-base text-muted-foreground sm:text-xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          >
            We fly your goods from China to Tanzania and account for every
            package along the way — from{" "}
            <span className="font-semibold text-foreground">
              our China warehouse
            </span>{" "}
            to the moment you{" "}
            <span className="font-semibold text-foreground">collect in Dar</span>
            .
          </motion.p>

          {/* Tracking is the primary action on this page. */}
          <motion.form
            onSubmit={onSubmit}
            className="mx-auto flex w-full max-w-xl flex-col gap-2 sm:flex-row"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            <div className="relative flex-1">
              <PackageSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tracking number e.g. TX-000123"
                aria-label="Tracking or batch number"
                className="h-12 rounded-xl pl-9 font-mono text-sm uppercase tabular placeholder:font-sans placeholder:normal-case"
              />
            </div>
            <Button
              type="submit"
              variant="brand"
              className="h-12 rounded-xl px-6"
            >
              Track
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </motion.form>

          <motion.div
            className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 pb-4 text-sm"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.5 }}
          >
            {[
              { icon: Warehouse, label: "Own warehouse in Guangzhou" },
              { icon: ShieldCheck, label: "QR-verified release" },
              { icon: CheckCircle2, label: "Batch manifests, not guesswork" },
            ].map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 text-muted-foreground"
              >
                <Icon className="h-4 w-4 text-brand" />
                {label}
              </span>
            ))}
          </motion.div>

          {/* Preview panel — the acme-hero pattern, holding a tracking card. */}
          <motion.div
            className="w-full rounded-3xl border bg-muted/30 p-2"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.8 }}
          >
            <div className="relative w-full">
              <div className="relative w-full overflow-hidden rounded-[1.25rem] border bg-background shadow-lift">
                <TrackingPreview />
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] rounded-b-[1.25rem] bg-gradient-to-t from-background to-transparent" />
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

const PREVIEW_STEPS = [
  { label: "Received in China", place: "Guangzhou warehouse", done: true },
  { label: "In transit", place: "China → Tanzania", done: true },
  { label: "Arrived in Tanzania", place: "Dar es Salaam warehouse", done: true },
  { label: "Ready for pickup", place: "Payment confirmed", done: false },
  { label: "Delivered", place: "Collected by customer", done: false },
];

function TrackingPreview() {
  return (
    <div className="p-5 text-left sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Shipment
          </p>
          <p className="font-mono text-xl font-semibold tabular">TX-000123</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
          <span className="h-1.5 w-1.5 rounded-full bg-warning" />
          Arrived in Tanzania
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { label: "Batch", value: "BATCH-2026-001" },
          { label: "Origin", value: "Guangzhou, China" },
          { label: "Packages", value: "4" },
        ].map((item) => (
          <div key={item.label} className="rounded-lg border bg-muted/40 p-3">
            <p className="text-xs text-muted-foreground">{item.label}</p>
            <p className="mt-0.5 font-mono text-sm font-medium tabular">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <ol className="mt-6 space-y-0">
        {PREVIEW_STEPS.map((step, i) => (
          <li key={step.label} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={
                  step.done
                    ? "mt-1 h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-brand/15"
                    : "mt-1 h-2.5 w-2.5 rounded-full border-2 border-muted-foreground/30 bg-background"
                }
              />
              {i < PREVIEW_STEPS.length - 1 ? (
                <span
                  className={
                    step.done
                      ? "my-1 w-px flex-1 bg-brand/40"
                      : "my-1 w-px flex-1 bg-border"
                  }
                />
              ) : null}
            </div>
            <div className="pb-5">
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

      <div className="pt-2">
        <Button asChild variant="outline" className="rounded-xl">
          <Link href="/track">
            Track your own shipment
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
