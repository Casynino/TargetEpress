import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Camera,
  ClipboardCheck,
  MapPin,
  PackageCheck,
  ScanLine,
  Warehouse,
} from "lucide-react";

import { Reveal } from "@/components/site/reveal";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Our warehouses",
  description:
    "Target Express operates its own warehouse in Guangzhou and its own office in Dar es Salaam. Every piece of cargo is weighed, photographed and labelled by our own staff.",
};

const HANDLING = [
  {
    icon: PackageCheck,
    title: "Received in your name",
    body: "Your supplier delivers to our address with your name on the cartons. We match it to you and give it a tracking number the same day.",
  },
  {
    icon: Camera,
    title: "Photographed as it arrives",
    body: "Before anything is packed for the flight we photograph it. That is your record of condition, and it is the first thing we look at if there is ever a claim.",
  },
  {
    icon: ScanLine,
    title: "Every package labelled",
    body: "Each physical box gets its own code. Five cartons means five labels, so a missing one is visible immediately rather than at the counter in Dar.",
  },
  {
    icon: ClipboardCheck,
    title: "Checked against a manifest on arrival",
    body: "In Dar the whole flight is checked piece by piece against a printed list. Anything short is flagged there, not weeks later.",
  },
];

export default function WarehousesPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-[hsl(var(--ink))] py-20 text-white sm:py-24">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/25 via-transparent to-signal/10"
        />
        <div className="container relative">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
            Our warehouses
          </p>
          <h1 className="mt-3 max-w-3xl font-display text-4xl font-bold leading-[1.08] sm:text-5xl">
            Our own space at both ends of the route.
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-white/70">
            Not an agent&apos;s address, not a shared depot. Your cargo is
            handled by people who work for us, in Guangzhou and in Dar es
            Salaam.
          </p>
        </div>
      </section>

      <section className="section">
        <div className="container grid gap-6 lg:grid-cols-2">
          <Reveal className="rounded-2xl border bg-card p-7 shadow-soft">
            <span className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1.5 text-xs font-semibold text-brand">
              <Warehouse className="h-3.5 w-3.5" />
              China
            </span>
            <h2 className="mt-4 font-display text-2xl font-bold">
              Guangzhou warehouse
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Where everything starts. Suppliers from Baima, Shahe, Zhanxi and
              the electronics markets deliver here, and we consolidate it into
              the flight.
            </p>
            <dl className="mt-6 space-y-4 border-t pt-6 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Address</dt>
                <dd className="mt-1 font-medium">
                  {COMPANY.chinaOffice.addressCn}
                </dd>
                <dd className="mt-0.5 text-muted-foreground">
                  {COMPANY.chinaOffice.addressEn}
                </dd>
                <dd className="mt-0.5 text-muted-foreground">
                  {COMPANY.chinaOffice.rooms}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Phone</dt>
                {COMPANY.chinaOffice.phones.map((phone) => (
                  <dd key={phone} className="mt-1 font-mono tabular">
                    {phone}
                  </dd>
                ))}
              </div>
            </dl>
            <Link
              href="/china"
              className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
            >
              Full address for your supplier
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>

          <Reveal
            delay={80}
            className="rounded-2xl border bg-card p-7 shadow-soft"
          >
            <span className="inline-flex items-center gap-2 rounded-full bg-signal/10 px-3 py-1.5 text-xs font-semibold text-signal">
              <MapPin className="h-3.5 w-3.5" />
              Tanzania
            </span>
            <h2 className="mt-4 font-display text-2xl font-bold">
              Dar es Salaam
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Where you collect. Cargo is checked in against the manifest,
              invoiced, and released against your tracking number.
            </p>
            <dl className="mt-6 space-y-4 border-t pt-6 text-sm">
              {COMPANY.offices.map((office) => (
                <div key={office.id}>
                  <dt className="text-xs text-muted-foreground">
                    {office.name}
                  </dt>
                  <dd className="mt-1 font-medium">{office.address}</dd>
                  <dd className="mt-0.5 text-muted-foreground">{office.note}</dd>
                  <dd className="mt-0.5 font-mono text-xs tabular text-muted-foreground">
                    {office.phones.join(" · ")}
                  </dd>
                </div>
              ))}
            </dl>
            <Link
              href="/contact"
              className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
            >
              Directions and opening hours
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Reveal>
        </div>
      </section>

      <section className="section border-y bg-muted/30">
        <div className="container">
          <h2 className="font-display text-3xl font-bold tracking-tight">
            What happens to your cargo inside
          </h2>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            The same four things, to every piece, every time.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {HANDLING.map((item, index) => (
              <Reveal
                key={item.title}
                delay={index * 70}
                className="rounded-xl border bg-card p-6 shadow-soft"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <item.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-bold">
                  {item.title}
                </h3>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {item.body}
                </p>
              </Reveal>
            ))}
          </div>

          <p className="mt-8 max-w-3xl rounded-xl border bg-card p-5 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">
              A note on storage.
            </span>{" "}
            Our warehouses are built for cargo that is moving — receiving,
            consolidating and dispatching. We will hold your goods free of
            charge while you wait for the rest of an order to arrive, but this
            is not long-term warehousing, and cargo sitting in Dar after it has
            been cleared does eventually attract storage charges.
          </p>
        </div>
      </section>
    </>
  );
}
