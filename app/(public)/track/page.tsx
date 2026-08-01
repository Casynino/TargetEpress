import { Suspense } from "react";
import Image from "next/image";
import type { Metadata } from "next";
import {
  Boxes,
  Camera,
  CheckCircle2,
  CircleHelp,
  MapPin,
  MessageCircle,
  Plane,
  SearchX,
  Wallet,
} from "lucide-react";

import { PageHero } from "@/components/site/page-hero";
import { SectionBackdrop } from "@/components/site/section-backdrop";
import { TrackForm } from "@/components/site/track-form";
import { IMAGES, img } from "@/lib/imagery";
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
    <>
      {/* The search sits inside the hero rather than under it. This is the page
          customers arrive on from a WhatsApp message with a number in hand —
          the field they came to use should be the first thing on the screen,
          not below a banner. */}
      <PageHero
        image={IMAGES.packedCartons}
        eyebrow="Fuatilia mzigo"
        title="Track your cargo"
        body={
          <>
            Enter the tracking number on your label (
            <span className="font-mono text-white">TX-000123</span>) or the batch
            number we gave you (
            <span className="font-mono text-white">BATCH-2026-001</span>).
          </>
        }
      >
        <div className="max-w-2xl">
          <Suspense
            fallback={<div className="h-12 rounded-xl border border-white/15 bg-white/5" />}
          >
            <TrackForm />
          </Suspense>
        </div>
      </PageHero>

      {/* The result column is narrow by design, so most of what a customer
          sees on this page is the field around it. Aurora rather than photo:
          everything below is `bg-card` with muted labels — dark-on-light —
          and an ink section would swallow the whole result card. */}
      <section className="relative isolate py-12 md:py-16">
        <SectionBackdrop variant="aurora" />
        <div className="container">
          <div className="mx-auto max-w-3xl">
            {result ? <TrackingResultView result={result} /> : <EmptyState />}
          </div>
        </div>
      </section>
    </>
  );
}

/**
 * What a customer sees before they have searched — which, on the page most
 * people arrive at from a WhatsApp link, is the majority of the time.
 *
 * A dashed grey rectangle on white was the whole of it. Since this is the one
 * thing on the screen under the hero, it carries a photograph of the warehouse
 * the label was applied in. Every class inside is an explicit white/ink value:
 * `text-muted-foreground` on this panel would be unreadable.
 */
function EmptyState() {
  return (
    <div className="relative isolate overflow-hidden rounded-2xl border border-white/10 bg-[hsl(var(--ink))] p-10 text-center text-white shadow-soft">
      <Image
        src={img(IMAGES.warehouseAisle, 1200)}
        alt=""
        fill
        sizes="(max-width: 768px) 100vw, 768px"
        className="-z-10 object-cover"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[hsl(var(--ink)/0.84)]"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-gradient-to-t from-[hsl(var(--ink))] via-transparent to-[hsl(var(--ink)/0.55)]"
      />
      <CircleHelp className="mx-auto h-8 w-8 text-gold" />
      <p className="mt-3 font-medium">Nothing to show yet</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-white/70">
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

      <dl className="grid gap-px bg-border sm:grid-cols-3 lg:grid-cols-4">
        {[
          { label: "Cargo", value: result.description },
          { label: "Shipper", value: result.customerInitials },
          {
            label: "Weight",
            value:
              result.weightKg === null ? "—" : `${result.weightKg.toFixed(2)} kg`,
          },
          { label: "Counted as", value: result.packagesLabel },
          { label: "Route", value: `${result.origin} → Dar es Salaam` },
          { label: "Now at", value: result.location },
          { label: "Batch", value: result.batchNumber ?? "Not yet assigned" },
          {
            label: "Received in China",
            value: result.registeredAt
              ? new Date(result.registeredAt).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "—",
          },
          {
            label: "Expected in Dar",
            value: result.expectedArrival
              ? new Date(result.expectedArrival).toLocaleDateString("en-GB", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })
              : "Once it is on a flight",
          },
        ].map((item) => (
          <div key={item.label} className="bg-card p-5">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="mt-1 text-sm font-medium">{item.value}</dd>
          </div>
        ))}
      </dl>

      {/* Once the cargo lands, the number that matters to a customer with five
          cartons is how many of the five are actually here. */}
      {result.packageProgress && result.packageProgress.total > 1 ? (
        <div className="border-b bg-muted/30 px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">{result.packageProgress.label}</p>
            <p className="text-xs text-muted-foreground tabular">
              {result.packageProgress.arrived} / {result.packageProgress.total}
            </p>
          </div>
          <div className="mt-2 flex gap-1" aria-hidden>
            {Array.from({ length: result.packageProgress.total }, (_, index) => (
              <span
                key={index}
                className={`h-1.5 flex-1 rounded-full ${
                  index < result.packageProgress!.collected
                    ? "bg-brand"
                    : index < result.packageProgress!.arrived
                      ? "bg-brand/40"
                      : "bg-border"
                }`}
              />
            ))}
          </div>
          {result.packageProgress.arrived < result.packageProgress.total ? (
            <p className="mt-2 text-xs text-muted-foreground">
              The rest is still on its way. We release cargo only when every
              package has arrived, so nothing goes missing between us.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Proof of condition, taken at our counter in Guangzhou. Handover
          photos are deliberately not here — they show a person's face. */}
      {result.photos.length > 0 ? (
        <div className="border-t p-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Camera className="h-4 w-4 text-brand" />
            Your cargo at our China warehouse
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Taken when we received it, before it was packed for the flight.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {result.photos.map((photo) => (
              <a
                key={photo.id}
                href={photo.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block h-24 w-24 overflow-hidden rounded-lg border transition-transform hover:scale-105 motion-reduce:hover:scale-100"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={`Cargo photo for ${result.trackingNumber}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        </div>
      ) : null}

      {/* Only when Finance has not billed it. Once an invoice exists the real
          charge replaces this entirely — two numbers on one page is how a
          customer ends up quoting the wrong one back at you. */}
      {result.estimate && !result.charge ? (
        <div className="border-t bg-muted/30 p-6">
          <h2 className="text-sm font-semibold">Estimated shipping cost</h2>
          <p className="mt-2 font-display text-3xl font-bold tabular">
            {result.estimate.currency}{" "}
            {result.estimate.total.toLocaleString("en-US", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {result.estimate.basis}
          </p>
          <p className="mt-4 rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-warning">
              This is an estimate, not an invoice.
            </span>{" "}
            The final charge can change with the exchange rate on the day, any
            discount agreed, special handling, and our Finance team&apos;s final
            check of the weight.
          </p>
        </div>
      ) : null}

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
