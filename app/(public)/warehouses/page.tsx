import Image from "next/image";
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

import { MediaBand } from "@/components/site/media-card";
import { PageHero } from "@/components/site/page-hero";
import { Reveal } from "@/components/site/reveal";
import { SectionBackdrop } from "@/components/site/section-backdrop";
import { IMAGES, img } from "@/lib/imagery";
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
      <PageHero
        image={IMAGES.warehouseAisle}
        eyebrow="Our warehouses"
        title="Our own space at both ends of the route."
        body={<>Not an agent&apos;s address, not a shared depot. Your cargo is handled by people who work for us, in Guangzhou and in Dar es Salaam.</>}
      />

      <section className="section relative isolate">
        <SectionBackdrop variant="aurora" />
        <div className="container grid gap-6 lg:grid-cols-2">
          <Reveal className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-soft transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-gold/50 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0">
            <div className="relative h-52 overflow-hidden sm:h-60">
              <Image
                src={img(IMAGES.cargoHold, 900)}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--ink)/0.94)] via-[hsl(var(--ink)/0.35)] to-transparent"
              />
              <span className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-[hsl(var(--ink)/0.62)] px-3 py-1.5 text-xs font-semibold text-gold backdrop-blur">
                <Warehouse className="h-3.5 w-3.5" />
                China
              </span>
              <h2 className="absolute inset-x-6 bottom-5 font-display text-2xl font-bold text-white drop-shadow">
                Guangzhou warehouse
              </h2>
            </div>
            <div className="p-7">
              <p className="text-sm text-muted-foreground">
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
            </div>
          </Reveal>

          <Reveal
            delay={80}
            className="group flex flex-col overflow-hidden rounded-2xl border bg-card shadow-soft transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-gold/50 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <div className="relative h-52 overflow-hidden sm:h-60">
              <Image
                src={img(IMAGES.loadingTruck, 900)}
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
              />
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--ink)/0.94)] via-[hsl(var(--ink)/0.35)] to-transparent"
              />
              <span className="absolute left-5 top-5 inline-flex items-center gap-2 rounded-full border border-signal/50 bg-[hsl(var(--ink)/0.62)] px-3 py-1.5 text-xs font-semibold text-white backdrop-blur">
                <MapPin className="h-3.5 w-3.5 text-signal" />
                Tanzania
              </span>
              <h2 className="absolute inset-x-6 bottom-5 font-display text-2xl font-bold text-white drop-shadow">
                Dar es Salaam
              </h2>
            </div>
            <div className="p-7">
              <p className="text-sm text-muted-foreground">
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
                    <dd className="mt-0.5 text-muted-foreground">
                      {office.note}
                    </dd>
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
            </div>
          </Reveal>
        </div>
      </section>

      <MediaBand
        image={IMAGES.cargoHold}
        eyebrow="Between the two"
        title="Between the two buildings there is one flight."
        body="What our staff consolidate in Guangzhou is what our staff check in when it lands in Dar es Salaam. Nobody else handles it in between."
      />

      <section className="section relative isolate border-y bg-muted/30">
        <SectionBackdrop variant="stars" />
        <div className="container">
          <h2 className="rule-gold font-display text-3xl font-bold tracking-tight">
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
                className="rounded-xl border bg-card p-6 shadow-soft transition-[box-shadow,border-color] duration-300 hover:border-gold/50 hover:shadow-lift motion-reduce:transition-none"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg border border-gold/30 bg-brand/10 text-brand">
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
