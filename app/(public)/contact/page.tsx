import type { Metadata } from "next";
import { Clock, Mail, MapPin, MessageCircle, Phone } from "lucide-react";

import { Button } from "@/components/ui/button";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Reach Target Express Air Cargo in Dar es Salaam and Guangzhou — phone, WhatsApp, email and warehouse addresses.",
};

export default function ContactPage() {
  return (
    <div className="container py-12 md:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-brand">
          Contact
        </p>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight sm:text-5xl">
          Talk to a human
        </h1>
        <p className="mt-4 text-muted-foreground">
          WhatsApp is fastest during working hours. For shipment status, the
          tracking page will always answer quicker than we can.
        </p>
      </div>

      <div className="mx-auto mt-12 grid max-w-5xl gap-5 md:grid-cols-3">
        {[
          {
            icon: MessageCircle,
            label: "WhatsApp",
            value: COMPANY.phone,
            href: `https://wa.me/${COMPANY.whatsapp}`,
            note: "Fastest response",
          },
          {
            icon: Phone,
            label: "Call the office",
            value: COMPANY.phone,
            href: `tel:${COMPANY.phone}`,
            note: "Mon–Sat, working hours",
          },
          {
            icon: Mail,
            label: "Email",
            value: COMPANY.email,
            href: `mailto:${COMPANY.email}`,
            note: "For invoices and documents",
          },
        ].map(({ icon: Icon, label, value, href, note }) => (
          <a
            key={label}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
            className="group rounded-xl border bg-card p-6 shadow-soft transition-shadow hover:shadow-lift"
          >
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
              <Icon className="h-5 w-5" />
            </span>
            <h2 className="mt-4 font-display font-semibold">{label}</h2>
            <p className="mt-1 text-sm text-foreground group-hover:text-brand">
              {value}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">{note}</p>
          </a>
        ))}
      </div>

      <div className="mx-auto mt-8 grid max-w-5xl gap-5 md:grid-cols-2">
        {[
          {
            title: "Dar es Salaam warehouse",
            address: COMPANY.darAddress,
            body: "Collection point. Bring your pickup note — printed or on your phone.",
          },
          {
            title: "Guangzhou warehouse",
            address: COMPANY.chinaAddress,
            body: "Delivery address for your supplier. Ask us for the full address in Chinese before they ship.",
          },
        ].map((place) => (
          <div key={place.title} className="rounded-xl border bg-card p-6">
            <h2 className="flex items-center gap-2 font-display font-semibold">
              <MapPin className="h-4 w-4 text-brand" />
              {place.title}
            </h2>
            <p className="mt-3 text-sm text-muted-foreground">{place.address}</p>
            <p className="mt-3 text-sm text-muted-foreground">{place.body}</p>
          </div>
        ))}
      </div>

      <div className="mx-auto mt-8 max-w-5xl rounded-xl border bg-muted/30 p-6">
        <h2 className="flex items-center gap-2 font-display font-semibold">
          <Clock className="h-4 w-4 text-brand" />
          Before you message us about a shipment
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Have your tracking number ready — it is on the label attached to your
          cargo. With it, we can answer in one message instead of ten.
        </p>
        <Button asChild variant="brand" className="mt-5 rounded-xl">
          <a
            href={`https://wa.me/${COMPANY.whatsapp}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <MessageCircle className="mr-2 h-4 w-4" />
            Message us on WhatsApp
          </a>
        </Button>
      </div>
    </div>
  );
}
