import Image from "next/image";
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

export const metadata: Metadata = {
  title: "Services & pricing",
  description:
    "Air freight from Guangzhou and Hong Kong to Dar es Salaam: consolidation, batch shipping, arrival verification and QR-secured collection.",
};

const FAQ = [
  {
    q: "Bei inahesabiwaje? / How is the price calculated?",
    a: "Inategemea unachotuma. Nguo, viatu na mizigo ya kawaida ni kwa kilo. Simu, laptop na tablet ni bei moja kwa kila kipande — uzito hauhusiki. Mzigo wako unapimwa China tunapoupokea, na uzito huo ndio unaoonekana kwenye invoice. Angalia bei zote kwenye ukurasa wa bei.",
  },
  {
    q: "Inachukua siku ngapi? / How long does it take?",
    a: "Ahadi yetu ni siku tatu kutoka mzigo unapopanda ndege hadi unapokuwa tayari kuchukuliwa Dar. Muda unaotumika kabla ya hapo unategemea lini batch inayofuata inafungwa Guangzhou.",
  },
  {
    q: "Nilipe vipi? / How do I pay?",
    a: "Cash ofisini, M-Pesa, Tigo Pesa, Airtel Money, bank transfer au cheque. Kila malipo unapata risiti yenye namba. Mzigo unatolewa tu baada ya malipo kukamilika.",
  },
  {
    q: "Nisitume nini? / What can I not send?",
    a: "Betri zinazosafirishwa peke yake, vitu vinavyoweza kuwaka au kulipuka, bidhaa za kughushi, na chochote kilichozuiliwa na airline au forodha ya Tanzania. Kama hujui, tuulize kabla muuzaji wako atume.",
  },
  {
    q: "Ikiwa mzigo umepungua au umeharibika? / If something is missing or damaged?",
    a: "Kila batch inahesabiwa kwenye manifest inapofika Dar. Ikiwa mzigo umepungua, umeharibika au uzito hauendani, tunaandika kama exception siku hiyo na tunakupigia — badala ya kugundua wakati umekuja kuchukua.",
  },
  {
    q: "Nachukua vipi mzigo? / How do I collect?",
    a: "Baada ya malipo, tunakupa pickup note yenye QR ya mzigo wako. Njoo Aggrey au Ndanda nayo — tunaskani note, tunaskani mzigo, tunahakikisha zinalingana, kisha tunakupa mzigo. Mtu mwingine anaweza kuchukua kwa niaba yako akiwa na note na ID yake.",
  },
];

export default function ServicesPage() {
  return (
    <div className="container py-12 md:py-16">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-bold uppercase tracking-wider text-signal">
          Huduma na bei
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
          Kila kitu kati ya muuzaji wako na duka lako
        </h1>
        <p className="mt-4 text-muted-foreground">
          Njia moja, msingi mmoja wa bei, namba moja ya kufuatilia. Hapa chini
          ni kile tunachofanya na mzigo wako na kinachokugharimu.
        </p>
      </div>

      <div className="mx-auto mt-10 max-w-5xl overflow-hidden rounded-2xl border shadow-lift">
        <Image
          src="https://images.unsplash.com/photo-1520437358207-323b43b50729?auto=format&fit=crop&w=1600&q=70"
          alt="Aircraft on approach at sunset"
          width={1600}
          height={600}
          sizes="(max-width: 1024px) 100vw, 1024px"
          className="h-52 w-full object-cover sm:h-72"
          priority
        />
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
            Rates differ by category, and the category also decides which airport
            your goods fly from. The full list is published — we do not quote from
            memory.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                title: "Normal goods",
                route: "Guangzhou",
                examples:
                  "Clothes, shoes, bags, wigs, jewellery, car parts, general merchandise",
                basis: "Per kilogram, cheaper above 10 kg",
              },
              {
                title: "Electronics",
                route: "Hong Kong",
                examples:
                  "Phones, laptops, tablets, smart watches, cameras, AirPods, documents",
                basis: "Fixed price per item — weight does not matter",
              },
              {
                title: "Special goods",
                route: "Hong Kong",
                examples:
                  "Medicines, food, oils, batteries, printers, monitors, speakers, LED displays",
                basis: "Per kilogram at one flat rate",
              },
            ].map((group) => (
              <div key={group.title} className="rounded-xl border bg-card p-5 shadow-soft">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-display font-semibold">{group.title}</h3>
                  <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[11px] font-medium text-brand">
                    {group.route}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{group.examples}</p>
                <p className="mt-3 border-t pt-3 text-xs font-medium">{group.basis}</p>
              </div>
            ))}
          </div>
          <div className="mt-6">
            <Button asChild variant="brand" className="rounded-xl">
              <Link href="/pricing">
                See every price
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
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
