import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import {
  Building2,
  Instagram,
  Mail,
  MapPin,
  MessageCircle,
  PackageSearch,
  Phone,
  Smartphone,
  Warehouse,
} from "lucide-react";

import { PageHero } from "@/components/site/page-hero";
import { SectionBackdrop } from "@/components/site/section-backdrop";
import { Button } from "@/components/ui/button";
import { IMAGES, img } from "@/lib/imagery";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Wasiliana nasi · Contact",
  description:
    "Reach Target Express Air Cargo — offices at Aggrey and Ndanda in Dar es Salaam, and our warehouse in Guangzhou, China.",
};

/**
 * A photograph per collection point, by position rather than by id, so an
 * office added to the constants still gets a picture instead of a grey box.
 */
const OFFICE_IMAGES = [IMAGES.warehouseAisle, IMAGES.apron];

export default function ContactPage() {
  return (
    <>
      <PageHero
        image={IMAGES.apron}
        eyebrow="Wasiliana nasi"
        title="Tupigie au tuandikie"
        body="WhatsApp ni njia ya haraka. Kwa hali ya mzigo, ukurasa wa kufuatilia unajibu haraka kuliko sisi."
      />

      {/* Fast contact */}
      <section className="relative isolate border-b py-14 md:py-20">
        <SectionBackdrop variant="aurora" />

        <div className="container">
          <div className="mx-auto grid max-w-5xl gap-5 md:grid-cols-3">
            {[
              {
                icon: MessageCircle,
                label: "WhatsApp",
                value: COMPANY.phone,
                href: `https://wa.me/${COMPANY.whatsapp}`,
                note: "Majibu ya haraka",
                accent: true,
              },
              {
                icon: Phone,
                label: "Tupigie simu",
                value: COMPANY.phoneAlt,
                href: `tel:${COMPANY.phoneAlt.replace(/\s/g, "")}`,
                note: "Saa za kazi",
              },
              {
                icon: Mail,
                label: "Barua pepe",
                value: COMPANY.email,
                href: `mailto:${COMPANY.email}`,
                note: "Invoice na nyaraka",
              },
            ].map(({ icon: Icon, label, value, href, note, accent }) => (
              <a
                key={label}
                href={href}
                target={href.startsWith("http") ? "_blank" : undefined}
                rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
                className={`group rounded-xl border bg-card/85 p-6 shadow-soft backdrop-blur-sm transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-gold/50 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0 ${
                  accent ? "border-signal/40" : ""
                }`}
              >
                <span
                  className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${
                    accent
                      ? "bg-signal/10 text-signal"
                      : "bg-brand/10 text-brand"
                  }`}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="mt-4 font-display font-semibold">{label}</h2>
                <p className="mt-1 font-mono text-sm tabular text-foreground group-hover:text-signal">
                  {value}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">{note}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Tanzania offices */}
      <section className="relative isolate border-b py-14 md:py-20">
        <SectionBackdrop variant="stars" />

        <div className="container">
          <div className="mx-auto max-w-5xl">
            <h2 className="rule-gold font-display text-2xl font-bold tracking-tight">
              Ofisi zetu Tanzania
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Hapa ndipo unachukua mzigo wako. Njoo na pickup note yako — kwenye
              simu au iliyochapishwa.
            </p>

            {/* One Dar office, so one card. A two-column grid would stand it
                beside an empty half. */}
            <div className="mt-6 grid gap-5">
              {COMPANY.offices.map((office, i) => (
                <div
                  key={office.id}
                  className="group overflow-hidden rounded-xl border bg-card/90 shadow-soft backdrop-blur-sm transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-gold/50 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <div className="relative h-36 overflow-hidden sm:h-40">
                    <Image
                      src={img(
                        OFFICE_IMAGES[i % OFFICE_IMAGES.length],
                        700
                      )}
                      alt=""
                      fill
                      sizes="(max-width: 768px) 100vw, 50vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
                    />
                    <div
                      aria-hidden
                      className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--ink)/0.92)] via-[hsl(var(--ink)/0.25)] to-transparent"
                    />
                    <p className="absolute left-4 top-4 rounded-full border border-gold/40 bg-[hsl(var(--ink)/0.62)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold backdrop-blur">
                      {office.city}
                    </p>
                    <h3 className="absolute inset-x-4 bottom-3 flex items-center gap-2 font-display text-lg font-semibold text-white drop-shadow">
                      <Building2 className="h-5 w-5 text-gold" />
                      {office.name}
                    </h3>
                  </div>

                  <div className="p-6">
                    <p className="flex items-start gap-2 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                      {office.address}
                    </p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {office.note}
                    </p>
                    <ul className="mt-4 space-y-1.5 border-t pt-4">
                      {office.phones.map((phone) => (
                        <li key={phone}>
                          <a
                            href={`tel:${phone.replace(/\s/g, "")}`}
                            className="inline-flex items-center gap-2 font-mono text-sm tabular hover:text-signal"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {phone}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* China — the one section on this page that is white on ink, so every
          class inside it is an explicit white/gold value rather than a
          theme-aware one that would disappear against the photograph. */}
      <section className="relative isolate bg-[hsl(var(--ink))] py-14 text-white md:py-20">
        <SectionBackdrop variant="photo" image={IMAGES.warehouseAisle} />

        <div className="container">
          <div className="mx-auto max-w-5xl">
            <div className="rounded-2xl border border-gold/25 bg-white/[0.06] p-6 shadow-lift backdrop-blur sm:p-8">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white">
                <Warehouse className="h-5 w-5 text-gold" />
                Warehouse yetu Guangzhou, China
              </h2>
              <p className="mt-3 text-base font-semibold leading-relaxed text-white">
                {COMPANY.chinaOffice.addressCn}
              </p>
              <p className="mt-2 text-sm text-white/70">
                {COMPANY.chinaOffice.addressEn} · {COMPANY.chinaOffice.rooms}
              </p>
              <ul className="mt-4 grid gap-2 border-t border-white/15 pt-4 sm:grid-cols-3">
                {COMPANY.chinaOffice.phones.map((phone) => (
                  <li key={phone}>
                    <a
                      href={`tel:${phone.replace(/\s/g, "")}`}
                      className="inline-flex items-center gap-2 font-mono text-sm tabular text-white hover:text-gold"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {phone}
                    </a>
                  </li>
                ))}
              </ul>
              <Button asChild variant="signal" className="mt-5 rounded-xl">
                <Link href="/china">Ukurasa wa anwani ya China</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Before you message */}
      <section className="relative isolate border-t py-14 md:py-20">
        <SectionBackdrop variant="aurora" />

        <div className="container">
          <div className="mx-auto max-w-5xl rounded-xl border bg-card/85 p-6 shadow-soft backdrop-blur-sm">
            <h2 className="flex items-center gap-2 font-display font-semibold">
              <PackageSearch className="h-4 w-4 text-signal" />
              Kabla ya kutuandikia kuhusu mzigo
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Kuwa na namba yako ya mzigo tayari — ipo kwenye lebo iliyowekwa
              kwenye mzigo wako. Nayo, tunaweza kujibu kwa ujumbe mmoja badala ya
              kumi.
            </p>
            <div className="mt-5 flex flex-wrap gap-3">
              <Button asChild variant="signal" className="rounded-xl">
                <Link href="/track">Fuatilia mzigo</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl">
                <a
                  href={COMPANY.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Instagram className="mr-2 h-4 w-4" />
                  @{COMPANY.instagram}
                </a>
              </Button>
              <Button asChild variant="outline" className="rounded-xl">
                <a
                  href={COMPANY.iosApp}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Smartphone className="mr-2 h-4 w-4" />
                  iPhone app
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
