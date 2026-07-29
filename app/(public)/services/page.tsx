import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Camera,
  ClipboardList,
  Package,
  Scale,
  ShieldAlert,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { GOODS_TYPE_LABELS } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Services & pricing",
  description:
    "Air freight from Guangzhou and Hong Kong to Dar es Salaam: consolidation, batch shipping, arrival verification and QR-secured collection.",
};

const FAQ = [
  {
    q: "How is the price calculated?",
    a: "Air freight is billed per kilogram. Your shipment is weighed in China when we receive it, and that weight is what appears on your invoice. Bulky-but-light cargo may be assessed on volume instead — we tell you before it flies, never after.",
  },
  {
    q: "How long does it take?",
    a: "Cargo normally leaves China within days of arriving at our warehouse, depending on when the next batch closes. Flight time plus clearing in Dar is a matter of days, not weeks.",
  },
  {
    q: "What can I not send?",
    a: "No hazardous goods, no batteries shipped loose, no counterfeit branded items, and nothing prohibited by the airline or by Tanzanian customs. If you are unsure, ask before your supplier ships.",
  },
  {
    q: "What happens if something is missing or damaged?",
    a: "Every batch is checked against its manifest on arrival in Dar. If a shipment is short, damaged or the weight does not match, we log it as an exception against your shipment the same day and contact you — rather than discovering it at the counter.",
  },
  {
    q: "How do I collect my goods?",
    a: "Once your invoice is settled, Finance issues a pickup note carrying your shipment's QR code. Bring it to the Dar warehouse. We scan the note, scan the cargo, confirm they match, and release it. Someone else may collect on your behalf if they carry the note.",
  },
];

export default function ServicesPage() {
  return (
    <div className="container py-12 md:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">
          Services &amp; pricing
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Everything between your supplier and your shop
        </h1>
        <p className="mt-4 text-muted-foreground">
          One corridor, one price basis, one tracking number. Below is exactly
          what we do with your cargo and what it costs you.
        </p>
      </div>

      {/* What we record */}
      <section className="section">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            What we record when your goods arrive in China
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            This is the moment your shipment starts to exist. Everything here is
            captured before your cargo goes anywhere near an aircraft.
          </p>

          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                icon: Package,
                title: "Packages & description",
                body: "How many pieces, and what is inside them, in plain words.",
              },
              {
                icon: Scale,
                title: "Weight",
                body: "Weighed on receipt. This is the figure your invoice is built from.",
              },
              {
                icon: Camera,
                title: "Photographs",
                body: "Cargo and packaging photographed before it is sealed into a batch.",
              },
              {
                icon: ClipboardList,
                title: "Your details",
                body: "Name and phone number, so the shipment is yours from day one.",
              },
              {
                icon: ShieldAlert,
                title: "QR label",
                body: "A permanent code attached to the cargo, used again at release in Dar.",
              },
              {
                icon: Wallet,
                title: "Rate applied",
                body: "The per-kilogram rate agreed for your goods type.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border bg-card p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Goods we handle */}
      <section className="section border-t">
        <div className="mx-auto max-w-5xl">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Goods we handle every week
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Rates differ by category — electronics and cosmetics are not priced
            like general merchandise. Ask for your rate before shipping.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {Object.values(GOODS_TYPE_LABELS)
              .filter((label) => label !== "Other")
              .map((label) => (
                <span
                  key={label}
                  className="rounded-full border bg-card px-3.5 py-1.5 text-sm text-muted-foreground"
                >
                  {label}
                </span>
              ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="section border-t">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
            Straight answers
          </h2>
          <dl className="mt-8 divide-y">
            {FAQ.map((item) => (
              <div key={item.q} className="py-6">
                <dt className="font-display font-semibold">{item.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild variant="brand" className="rounded-xl">
              <Link href="/contact">
                Get your rate
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/track">Track a shipment</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
