import { Suspense } from "react";
import type { Metadata } from "next";
import {
  Boxes,
  CircleHelp,
  MapPin,
  MessageCircle,
  Plane,
  SearchX,
} from "lucide-react";

import { TrackForm } from "@/components/site/track-form";
import { Button } from "@/components/ui/button";
import { COMPANY } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import { trackByCode, type TrackingResult } from "@/lib/tracking";

export const metadata: Metadata = {
  title: "Track your shipment",
  description:
    "Enter your Target Express tracking number or batch number to see where your cargo is.",
};

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const result = q ? await trackByCode(q) : null;

  return (
    <div className="container py-12 md:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Track your cargo
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Enter the tracking number on your label (
            <span className="font-mono">TX-000123</span>) or the batch number we
            gave you (<span className="font-mono">BATCH-2026-001</span>).
          </p>
        </div>

        <div className="mt-8">
          <Suspense fallback={<div className="h-12 rounded-xl border bg-muted/40" />}>
            <TrackForm />
          </Suspense>
        </div>

        <div className="mt-10">
          {result ? <TrackingResultView result={result} /> : <EmptyState />}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed bg-muted/20 p-10 text-center">
      <CircleHelp className="mx-auto h-8 w-8 text-muted-foreground/50" />
      <p className="mt-3 font-medium">Nothing to show yet</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
        Your tracking number is printed on the label attached to your cargo and
        was sent to you when your goods were registered in China.
      </p>
    </div>
  );
}

function TrackingResultView({ result }: { result: TrackingResult }) {
  if (result.kind === "not-found") {
    return (
      <div className="rounded-xl border bg-card p-10 text-center shadow-soft">
        <SearchX className="mx-auto h-8 w-8 text-muted-foreground/60" />
        <p className="mt-3 font-display text-lg font-semibold">
          We could not find{" "}
          <span className="font-mono">{result.query.toUpperCase()}</span>
        </p>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Check the number for typos. If your goods were only just handed to our
          China warehouse, the shipment may not be registered yet.
        </p>
        <Button asChild variant="outline" className="mt-6 rounded-xl">
          <a
            href={`https://wa.me/${COMPANY.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            Ask us on WhatsApp
          </a>
        </Button>
      </div>
    );
  }

  if (result.kind === "batch") {
    return (
      <div className="rounded-xl border bg-card shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b p-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Batch
            </p>
            <p className="font-mono text-2xl font-semibold tabular">
              {result.batchNumber}
            </p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-info/10 px-3 py-1.5 text-sm font-medium text-info">
            <Plane className="h-4 w-4" />
            {result.statusLabel}
          </span>
        </div>

        <dl className="grid gap-px bg-border sm:grid-cols-4">
          {[
            { label: "Origin", value: result.origin },
            { label: "Shipments in batch", value: String(result.shipmentCount) },
            { label: "Departed", value: formatDate(result.departureDate) },
            { label: "Arrived", value: formatDate(result.arrivalDate) },
          ].map((item) => (
            <div key={item.label} className="bg-card p-5">
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="mt-1 text-sm font-medium">{item.value}</dd>
            </div>
          ))}
        </dl>

        <div className="flex items-start gap-3 border-t bg-muted/30 p-5 text-sm text-muted-foreground">
          <Boxes className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            This is the flight status of the whole batch. For the status of your
            own cargo — including whether it is ready for pickup — search your
            personal tracking number instead.
          </p>
        </div>
      </div>
    );
  }

  const toneClass =
    result.status === "DELIVERED"
      ? "bg-success/10 text-success"
      : result.status === "READY_FOR_PICKUP"
        ? "bg-brand/10 text-brand"
        : result.status === "CANCELLED"
          ? "bg-destructive/10 text-destructive"
          : result.status === "IN_TRANSIT"
            ? "bg-info/10 text-info"
            : "bg-warning/10 text-warning";

  return (
    <div className="rounded-xl border bg-card shadow-soft">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b p-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Shipment
          </p>
          <p className="font-mono text-2xl font-semibold tabular">
            {result.trackingNumber}
          </p>
        </div>
        <span
          className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium ${toneClass}`}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          {result.statusLabel}
        </span>
      </div>

      <dl className="grid gap-px bg-border sm:grid-cols-4">
        {[
          { label: "Current location", value: result.location },
          { label: "Origin", value: result.origin },
          { label: "Batch", value: result.batchNumber ?? "Not yet assigned" },
          { label: "Packages", value: String(result.packages) },
        ].map((item) => (
          <div key={item.label} className="bg-card p-5">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="mt-1 text-sm font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>

      <div className="p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4 text-brand" />
          Shipment timeline
        </h2>

        <ol className="mt-5">
          {result.timeline.map((step, i, arr) => (
            <li key={step.status} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  className={
                    step.current
                      ? "mt-1 h-3 w-3 rounded-full bg-brand ring-4 ring-brand/20"
                      : step.done
                        ? "mt-1 h-3 w-3 rounded-full bg-brand/70"
                        : "mt-1 h-3 w-3 rounded-full border-2 border-muted-foreground/30 bg-background"
                  }
                />
                {i < arr.length - 1 ? (
                  <span
                    className={
                      step.done
                        ? "my-1 w-px flex-1 bg-brand/40"
                        : "my-1 w-px flex-1 bg-border"
                    }
                  />
                ) : null}
              </div>
              <div className="pb-6">
                <p
                  className={
                    step.done || step.current
                      ? "text-sm font-medium"
                      : "text-sm text-muted-foreground"
                  }
                >
                  {step.label}
                </p>
                <p className="text-xs text-muted-foreground">{step.location}</p>
                {step.at ? (
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    {formatDateTime(step.at)}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/30 p-5 text-xs text-muted-foreground">
        <span>Last updated {formatDateTime(result.lastUpdate)}</span>
        <a
          href={`https://wa.me/${COMPANY.whatsapp}?text=${encodeURIComponent(
            `Hello Target Express, I am asking about shipment ${result.trackingNumber}`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 font-medium text-foreground hover:text-brand"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Ask about this shipment
        </a>
      </div>
    </div>
  );
}
