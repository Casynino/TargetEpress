import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  ClipboardCheck,
  Container,
  MessageCircle,
  Plane,
  QrCode,
  Receipt,
  ScanLine,
  Timer,
  Truck,
  Warehouse,
} from "lucide-react";

import { Hero } from "@/components/site/hero";
import { Button } from "@/components/ui/button";
import { COMPANY } from "@/lib/constants";

const SERVICES = [
  {
    icon: Plane,
    title: "Air freight, China → Tanzania",
    body: "Consolidated air cargo out of Guangzhou and Hong Kong into Dar es Salaam on regular flights.",
  },
  {
    icon: Warehouse,
    title: "China warehouse & consolidation",
    body: "Send your supplier's goods to our Guangzhou address. We receive, check, photograph and hold them until your batch flies.",
  },
  {
    icon: Boxes,
    title: "Batch shipping",
    body: "Your cargo travels in a numbered batch with a full manifest, so nothing is 'somewhere in the container'.",
  },
  {
    icon: ClipboardCheck,
    title: "Arrival verification",
    body: "Every batch is checked package by package against its manifest in Dar. Shortages and damage are logged, not argued about.",
  },
  {
    icon: Receipt,
    title: "Clear invoicing",
    body: "One invoice per shipment, priced on weight. Pay by cash, mobile money, bank transfer or cheque and get a receipt.",
  },
  {
    icon: QrCode,
    title: "QR-secured collection",
    body: "Cargo is released only against a paid pickup note whose QR matches the shipment's own label.",
  },
];

const STEPS = [
  {
    icon: Container,
    title: "Your supplier delivers to our China warehouse",
    body: "We receive the goods, record weight, packages and description, photograph them, and give the shipment a permanent tracking number and QR label.",
  },
  {
    icon: Boxes,
    title: "We consolidate into a flight batch",
    body: "Your shipment joins a numbered batch. You can see the batch it belongs to from the moment it is loaded.",
  },
  {
    icon: Plane,
    title: "The batch flies to Dar es Salaam",
    body: "Airline, flight number and waybill are recorded at departure. Your tracking page moves to 'In transit'.",
  },
  {
    icon: ScanLine,
    title: "We verify on arrival",
    body: "The Dar warehouse checks each shipment off the printed manifest. Your cargo is only marked arrived once it is physically in the building.",
  },
  {
    icon: Receipt,
    title: "You pay and collect",
    body: "Finance confirms payment and issues a pickup note. Bring it to the warehouse; we scan it, scan the cargo, and release it to you.",
  },
];

const REASONS = [
  {
    icon: ScanLine,
    title: "One identity, end to end",
    body: "The QR code attached in China is the same one scanned at release in Dar. No re-labelling, no mixed-up cargo.",
  },
  {
    icon: Timer,
    title: "No more WhatsApp chasing",
    body: "Status is on a page, not in a chat thread. Check it yourself, any hour, from any phone.",
  },
  {
    icon: ClipboardCheck,
    title: "Exceptions are recorded",
    body: "If something is missing or damaged on arrival, it is logged against your shipment the same day — with a name behind the entry.",
  },
  {
    icon: Truck,
    title: "Release you can trust",
    body: "Nothing leaves the warehouse without a settled invoice and a valid pickup note. That protects your cargo as much as our books.",
  },
];

export default function HomePage() {
  return (
    <>
      <Hero />

      {/* Services */}
      <section id="services" className="section">
        <div className="container">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand">
              What we do
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              A complete air cargo service on one corridor
            </h2>
            <p className="mt-4 text-muted-foreground">
              We do one route properly rather than every route badly. Everything
              below is part of the standard service — not an upsell.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="group rounded-xl border bg-card p-6 shadow-soft transition-shadow hover:shadow-lift"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The corridor */}
      <section className="section border-y bg-muted/30">
        <div className="container">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-brand">
                The corridor
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Guangzhou and Hong Kong, straight into Dar es Salaam
              </h2>
              <div className="mt-5 space-y-4 text-muted-foreground">
                <p>
                  Most Tanzanian importers buy from the same few markets in
                  Guangzhou — Baiyun, Shahe, Yiwu-sourced stock arriving by
                  road. The hard part was never buying the goods. It was knowing
                  where they are after the supplier hands them over.
                </p>
                <p>
                  We hold a physical warehouse at the China end. Your supplier
                  delivers there, we register the cargo under your name and
                  phone number, and from that second it exists in a system
                  instead of a conversation.
                </p>
                <p>
                  Air freight keeps the corridor short: days, not the six to
                  eight weeks sea freight takes. For traders restocking fast
                  movers, that difference is the whole business.
                </p>
              </div>
              <Button asChild variant="brand" className="mt-8 rounded-xl">
                <Link href="/services">
                  See how pricing works
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="rounded-2xl border bg-card p-6 shadow-soft sm:p-8">
              <div className="space-y-6">
                {[
                  {
                    place: "Guangzhou / Hong Kong",
                    detail: "Receiving, weighing, photographing, labelling",
                    icon: Warehouse,
                  },
                  {
                    place: "In the air",
                    detail: "Numbered batch, airline waybill on record",
                    icon: Plane,
                  },
                  {
                    place: "Dar es Salaam",
                    detail: "Manifest check, invoicing, QR release",
                    icon: Truck,
                  },
                ].map(({ place, detail, icon: Icon }, i, arr) => (
                  <div key={place} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                        <Icon className="h-5 w-5" />
                      </span>
                      {i < arr.length - 1 ? (
                        <span className="my-2 w-px flex-1 bg-border" />
                      ) : null}
                    </div>
                    <div className="pb-2">
                      <p className="font-display font-semibold">{place}</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {detail}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="process" className="section">
        <div className="container">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wider text-brand">
              How it works
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Five steps, and you can see all of them
            </h2>
          </div>

          <ol className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <li
                key={title}
                className="relative rounded-xl border bg-card p-6 shadow-soft"
              >
                <span className="absolute right-5 top-5 font-display text-4xl font-bold text-muted-foreground/15 tabular">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-signal/10 text-signal">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 max-w-[85%] font-display text-lg font-semibold">
                  {title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Why us */}
      <section className="section border-t bg-muted/30">
        <div className="container">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wider text-brand">
                Why Target Express
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Built to remove the phone call
              </h2>
              <p className="mt-4 text-muted-foreground">
                The question every importer asks is the same: where is my cargo?
                We rebuilt our operation so the answer is always on a screen —
                for you and for every person in our company.
              </p>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              {REASONS.map(({ icon: Icon, title, body }) => (
                <div key={title} className="rounded-xl border bg-card p-6">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <h3 className="mt-3 font-display font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="section">
        <div className="container">
          <div className="relative overflow-hidden rounded-3xl bg-brand px-6 py-14 text-center text-brand-foreground sm:px-12">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 opacity-[0.13]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 15% 25%, white 1px, transparent 1px)",
                backgroundSize: "26px 26px",
              }}
            />
            <div className="relative mx-auto max-w-2xl">
              <h2 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Shipping from China this month?
              </h2>
              <p className="mt-4 text-brand-foreground/80">
                Talk to us before your supplier ships. We will give you the
                China warehouse address, your customer code, and a rate for your
                goods.
              </p>
              <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
                <Button
                  asChild
                  className="h-11 rounded-xl bg-background px-6 text-foreground hover:bg-background/90"
                >
                  <a
                    href={`https://wa.me/${COMPANY.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Chat on WhatsApp
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-11 rounded-xl border-brand-foreground/30 bg-transparent px-6 text-brand-foreground hover:bg-brand-foreground/10 hover:text-brand-foreground"
                >
                  <Link href="/contact">Contact the office</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
