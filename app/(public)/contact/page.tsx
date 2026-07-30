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

import { Button } from "@/components/ui/button";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Wasiliana nasi · Contact",
  description:
    "Reach Target Express Air Cargo — offices at Aggrey and Ndanda in Dar es Salaam, and our warehouse in Guangzhou, China.",
};

export default function ContactPage() {
  return (
    <div className="container py-12 md:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-signal">
          Wasiliana nasi
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
          Tupigie au tuandikie
        </h1>
        <p className="mt-4 text-muted-foreground">
          WhatsApp ni njia ya haraka. Kwa hali ya mzigo, ukurasa wa kufuatilia
          unajibu haraka kuliko sisi.
        </p>
      </div>

      {/* Fast contact */}
      <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
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
            className={`group rounded-xl border bg-card p-6 shadow-soft transition-shadow hover:shadow-lift ${
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

      {/* Tanzania offices */}
      <section className="mx-auto mt-14 max-w-5xl">
        <h2 className="font-display text-2xl font-bold tracking-tight">
          Ofisi zetu Tanzania
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Hapa ndipo unachukua mzigo wako. Njoo na pickup note yako — kwenye
          simu au iliyochapishwa.
        </p>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {COMPANY.offices.map((office) => (
            <div key={office.id} className="rounded-xl border bg-card p-6">
              <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Building2 className="h-5 w-5 text-brand" />
                {office.name}
              </h3>
              <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                {office.city}
              </p>
              <p className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                {office.address}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{office.note}</p>
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
          ))}
        </div>
      </section>

      {/* China */}
      <section className="mx-auto mt-10 max-w-5xl">
        <div className="rounded-xl border-2 border-signal/30 bg-card p-6">
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <Warehouse className="h-5 w-5 text-signal" />
            Warehouse yetu Guangzhou, China
          </h2>
          <p className="mt-3 text-base font-semibold leading-relaxed">
            {COMPANY.chinaOffice.addressCn}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {COMPANY.chinaOffice.addressEn} · {COMPANY.chinaOffice.rooms}
          </p>
          <ul className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-3">
            {COMPANY.chinaOffice.phones.map((phone) => (
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
          <Button asChild variant="signal" className="mt-5 rounded-xl">
            <Link href="/china">Ukurasa wa anwani ya China</Link>
          </Button>
        </div>
      </section>

      {/* Before you message */}
      <section className="mx-auto mt-10 max-w-5xl rounded-xl border bg-muted/30 p-6">
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
            <a href={COMPANY.iosApp} target="_blank" rel="noopener noreferrer">
              <Smartphone className="mr-2 h-4 w-4" />
              iPhone app
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}
