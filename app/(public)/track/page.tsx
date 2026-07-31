import { Suspense } from "react";
import type { Metadata } from "next";
import {
  Boxes,
  CheckCircle2,
  CircleHelp,
  MapPin,
  MessageCircle,
  Plane,
  SearchX,
  Wallet,
} from "lucide-react";

import { TrackForm } from "@/components/site/track-form";
import { TrackingTimeline } from "@/components/site/tracking-timeline";
import { Button } from "@/components/ui/button";
import { COMPANY } from "@/lib/constants";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  trackByCode,
  type PublicCharge,
  type TrackingResult,
} from "@/lib/tracking";

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

      <dl className="grid gap-px bg-border sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Cargo", value: result.description },
          {
            label: "Weight",
            value:
              result.weightKg === null ? "—" : `${result.weightKg.toFixed(2)} kg`,
          },
          { label: "Quantity", value: result.packagesLabel },
          { label: "Route", value: `${result.origin} → Dar es Salaam` },
          { label: "Now at", value: result.location },
          { label: "Batch", value: result.batchNumber ?? "Not yet assigned" },
        ].map((item) => (
          <div key={item.label} className="bg-card p-5">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="mt-1 text-sm font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>

      <ChargePanel
        charge={result.charge}
        collectable={result.collectable}
        note={result.collectionNote}
      />

      <div className="p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <MapPin className="h-4 w-4 text-brand" />
          Shipment timeline
        </h2>

        <TrackingTimeline
          steps={result.timeline.map((step) => ({
            ...step,
            atLabel: step.at ? formatDateTime(step.at) : null,
          }))}
        />
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

/**
 * What the customer owes, and whether they can come and get their cargo.
 *
 * Shows the shilling figure at the invoice's own rate — the number they were
 * quoted is the number they pay, whatever the rate has done since.
 */
function ChargePanel({
  charge,
  collectable,
  note,
}: {
  charge: PublicCharge | null;
  collectable: boolean;
  note: string;
}) {
  if (!charge) {
    return (
      <div className="border-t bg-muted/30 p-5 text-sm text-muted-foreground">
        <p>{note}</p>
        <p className="mt-1 text-xs">
          Your invoice is raised once the cargo is checked in at Dar es Salaam.
        </p>
      </div>
    );
  }

  const settled = charge.status === "PAID";

  return (
    <div className="border-t">
      <div className="flex flex-wrap items-start justify-between gap-6 p-6">
        <div>
          <p className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
            <Wallet className="h-3.5 w-3.5" />
            {settled ? "Total paid" : "Amount due"}
          </p>
          <p className="mt-1 font-display text-2xl font-bold tabular">
            {charge.currency}{" "}
            {(settled ? charge.total : charge.outstanding).toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          {(settled ? charge.totalLocal : charge.outstandingLocal) !== null ? (
            <p className="text-sm text-muted-foreground">
              ≈ {charge.localCurrency}{" "}
              {(settled
                ? charge.totalLocal!
                : charge.outstandingLocal!
              ).toLocaleString("en-US")}
            </p>
          ) : null}
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            Invoice {charge.invoiceNumber}
          </p>
        </div>

        <div className="min-w-[12rem]">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ${
              settled
                ? "bg-success/10 text-success"
                : charge.status === "PART_PAID"
                  ? "bg-warning/10 text-warning"
                  : "bg-destructive/10 text-destructive"
            }`}
          >
            {settled ? <CheckCircle2 className="h-4 w-4" /> : null}
            {settled
              ? "Paid in full"
              : charge.status === "PART_PAID"
                ? "Part paid"
                : "Not yet paid"}
          </span>
          {charge.status === "PART_PAID" ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {charge.currency} {charge.paid.toFixed(2)} received of{" "}
              {charge.currency} {charge.total.toFixed(2)}.
            </p>
          ) : null}
        </div>
      </div>

      <div
        className={`flex items-start gap-3 border-t p-5 text-sm ${
          collectable ? "bg-success/5 text-success" : "bg-muted/30 text-muted-foreground"
        }`}
      >
        {collectable ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <Boxes className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <p>{note}</p>
      </div>
    </div>
  );
}
