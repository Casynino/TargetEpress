import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  Building2,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Instagram,
  MapPin,
  MessageCircle,
  Phone,
  Plane,
  QrCode,
  Receipt,
  ScanLine,
  Smartphone,
  Timer,
  Warehouse,
} from "lucide-react";

import { FlightSchedule } from "@/components/site/flight-schedule";
import { Hero } from "@/components/site/hero";
import { LiveStats } from "@/components/site/live-stats";
import { RouteMap } from "@/components/site/route-map";
import { SectionBackdrop } from "@/components/site/section-backdrop";
import { Reveal } from "@/components/site/reveal";
import { Button } from "@/components/ui/button";
import { COMPANY, GOODS_TYPE_LABELS } from "@/lib/constants";
import { IMAGES } from "@/lib/imagery";

const SERVICES = [
  {
    icon: Warehouse,
    title: "Warehouse yetu Guangzhou",
    titleEn: "Our own warehouse in China",
    body: "Muuzaji wako anaacha mzigo kwenye anwani yetu Guangzhou. Tunapokea, tunapima, tunapiga picha na tunaandika kwa jina lako.",
  },
  {
    icon: Plane,
    title: "Usafirishaji wa ndege",
    titleEn: "Air freight, not sea",
    body: "Mizigo inasafiri kwa ndege kutoka Guangzhou hadi Dar es Salaam — siku, sio miezi kama meli.",
  },
  {
    icon: Boxes,
    title: "Batch na manifest",
    titleEn: "Batch shipping with a manifest",
    body: "Mzigo wako unasafiri katika batch yenye namba na orodha kamili. Hakuna 'mzigo uko huko mahali'.",
  },
  {
    icon: ClipboardCheck,
    title: "Ukaguzi wa kufika",
    titleEn: "Checked on arrival",
    body: "Kila batch inahesabiwa kipande kwa kipande Dar. Upungufu au uharibifu unaandikwa siku hiyo.",
  },
  {
    icon: Receipt,
    title: "Malipo na risiti",
    titleEn: "Clear invoicing",
    body: "Bei kwa kilo. Lipa kwa cash, M-Pesa, Tigo Pesa, Airtel Money, benki au cheque — upate risiti.",
  },
  {
    icon: QrCode,
    title: "Kuchukua kwa QR",
    titleEn: "QR-secured collection",
    body: "Mzigo unatolewa tu kwa pickup note yenye QR inayolingana na lebo iliyo kwenye mzigo wako.",
  },
];

const STEPS = [
  {
    icon: Building2,
    title: "Muuzaji anatuma Guangzhou",
    body: "Mpe muuzaji wako anwani yetu ya China. Anaacha mzigo pale — hakuna kingine unachotakiwa kufanya.",
  },
  {
    icon: Camera,
    title: "Tunaandika na kupiga picha",
    body: "Tunapima uzito, tunahesabu vipande, tunapiga picha, na tunaweka lebo yenye QR na namba yako ya kufuatilia.",
  },
  {
    icon: Plane,
    title: "Inapanda ndege",
    body: "Batch inasafiri. Airline, flight na waybill zinaandikwa. Ukurasa wako wa kufuatilia unabadilika kuwa 'Safarini'.",
  },
  {
    icon: ScanLine,
    title: "Tunakagua Dar",
    body: "Tunahesabu kila mzigo kwenye manifest. Mzigo wako unaonekana 'Imefika' baada ya kuwa ndani ya store.",
  },
  {
    icon: Receipt,
    title: "Unalipa na kuchukua",
    body: "Tunathibitisha malipo na kutoa pickup note. Njoo Aggrey au Ndanda, tunaskani, tunakupa mzigo wako.",
  },
];

export default function HomePage() {
  return (
    <>
      <Hero />

      {/* What the company has actually done, counted from the records */}
      <LiveStats />

      {/* The route, with the only moving thing on the site. */}
      <RouteMap />

      {/* The next planes out. Nothing else on the page has a deadline on it. */}
      <section className="section relative isolate border-y bg-[hsl(var(--ink))] text-white">
        <SectionBackdrop variant="photo" image={IMAGES.airportNight} />
        <div className="container">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-3xl font-bold tracking-tight">
                Ndege zinazofuata
              </h2>
              <p className="mt-2 max-w-xl text-white/65">
                Tunasafirisha kila Jumatano, Ijumaa na Jumapili. Mzigo wako
                ufike ghala letu Guangzhou kabla ya siku ya mwisho.
                <span className="mt-1 block text-sm text-white/45">
                  We fly three times a week. Get your cargo to our Guangzhou
                  warehouse by the cut-off day and it goes on that flight.
                </span>
              </p>
            </div>
            <Link
              href="/schedule"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-medium transition-colors hover:bg-white/10"
            >
              Ratiba kamili
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <FlightSchedule className="mt-8" />

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/book"
              className="inline-flex items-center gap-2 rounded-xl bg-signal px-5 py-3 text-sm font-semibold text-signal-foreground transition-transform hover:-translate-y-0.5 motion-reduce:hover:translate-y-0"
            >
              Book a shipment
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pickup"
              className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-5 py-3 text-sm font-medium transition-colors hover:bg-white/10"
            >
              Tunachukua mzigo kwako
            </Link>
          </div>
        </div>
      </section>

      {/* China — the part customers actually need */}
      <section id="china" className="section relative isolate border-y bg-muted/30">
        <SectionBackdrop variant="aurora" />
        <div className="container">
          <Reveal>
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="text-sm font-bold uppercase tracking-wider text-signal">
                Anwani ya China
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Mpe muuzaji wako anwani hii
              </h2>
              <p className="mt-4 text-muted-foreground">
                Hii ni warehouse yetu Guangzhou. Mtumie muuzaji wako anwani hii
                kwa Kichina — ndio anayoihitaji ili kuleta mzigo wako.
              </p>

              <div className="mt-6 rounded-xl border-2 border-signal/30 bg-card p-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  地址 / Address
                </p>
                <p className="mt-2 text-lg font-semibold leading-relaxed">
                  {COMPANY.chinaOffice.addressCn}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {COMPANY.chinaOffice.addressEn}
                  <br />
                  {COMPANY.chinaOffice.rooms}
                </p>

                <div className="mt-4 border-t pt-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                    电话 / Phone
                  </p>
                  <ul className="mt-2 space-y-1">
                    {COMPANY.chinaOffice.phones.map((phone) => (
                      <li key={phone}>
                        <a
                          href={`tel:${phone.replace(/\s/g, "")}`}
                          className="font-mono text-sm tabular hover:text-signal"
                        >
                          {phone}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Button asChild variant="signal" className="rounded-xl">
                  <Link href="/china">
                    Ukurasa kamili wa anwani
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" className="rounded-xl">
                  <a
                    href={`https://wa.me/${COMPANY.whatsapp}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Uliza kwa WhatsApp
                  </a>
                </Button>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-2xl border shadow-lift">
              <Image
                src="https://images.unsplash.com/photo-1587293852726-70cdb56c2866?auto=format&fit=crop&w=1200&q=70"
                alt="Cargo stacked and labelled inside the warehouse"
                width={1200}
                height={900}
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="h-full w-full object-cover"
              />
            </div>
          </div></Reveal>
        </div>
      </section>

      {/* Services */}
      <section id="services" className="section relative isolate">
        <SectionBackdrop variant="aurora" />
        <div className="container">
          <Reveal>
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-wider text-signal">
              Huduma zetu
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Kila kitu kati ya muuzaji wako na duka lako
            </h2>
            <p className="mt-4 text-muted-foreground">
              Njia moja, bei moja, namba moja ya kufuatilia. Yote yaliyo hapa
              chini ni huduma ya kawaida — hakuna malipo ya ziada.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {SERVICES.map(({ icon: Icon, title, titleEn, body }) => (
              <div
                key={title}
                className="rounded-xl border bg-card p-6 shadow-soft transition-shadow hover:shadow-lift"
              >
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-signal/10 text-signal">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold">
                  {title}
                </h3>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
                  {titleEn}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {body}
                </p>
              </div>
            ))}
          </div></Reveal>
        </div>
      </section>

      {/* How it works */}
      <section id="process" className="section relative isolate border-t">
        <SectionBackdrop variant="stars" />
        <div className="container">
          <Reveal>
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-wider text-signal">
              Inafanyaje kazi
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Hatua tano — na unaziona zote
            </h2>
          </div>

          <ol className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, body }, index) => (
              <li
                key={title}
                className="relative rounded-xl border bg-card p-6 shadow-soft"
              >
                <span className="absolute right-5 top-4 font-display text-4xl font-extrabold text-signal/10 tabular">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
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
          </ol></Reveal>
        </div>
      </section>

      {/* Cargo we carry, with a photo */}
      <section className="section relative isolate">
        <SectionBackdrop variant="aurora" />
        <div className="container">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="relative order-2 overflow-hidden rounded-2xl border shadow-lift lg:order-1">
              <Image
                src="https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1200&q=70"
                alt="Warehouse aisle stacked with cargo ready for dispatch"
                width={1200}
                height={800}
                sizes="(max-width: 1024px) 100vw, 55vw"
                className="h-full w-full object-cover"
              />
            </div>

            <div className="order-1 lg:order-2">
              <p className="text-sm font-bold uppercase tracking-wider text-signal">
                Mizigo tunayosafirisha
              </p>
              <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
                Kutoka simu hadi vipuri
              </h2>
              <p className="mt-4 text-muted-foreground">
                Bei inatofautiana kwa aina ya mzigo — electronics na cosmetics
                hazipimwi kama mzigo wa kawaida. Tuulize bei yako kabla ya
                kutuma.
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
              <Button asChild variant="signal" className="mt-8 rounded-xl">
                <a
                  href={`https://wa.me/${COMPANY.whatsapp}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Uliza bei yako
                </a>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Offices */}
      <section id="offices" className="section relative isolate border-t">
        <SectionBackdrop variant="aurora" />
        <div className="container">
          <Reveal>
          <div className="max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-wider text-signal">
              Ofisi zetu
            </p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Njoo utuone
            </h2>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {COMPANY.offices.map((office) => (
              <div key={office.id} className="rounded-xl border bg-card p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                  <MapPin className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-display text-lg font-semibold">
                  {office.name}
                </h3>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {office.city}
                </p>
                <p className="mt-3 text-sm text-muted-foreground">
                  {office.address}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {office.note}
                </p>
                <ul className="mt-4 space-y-1 border-t pt-3">
                  {office.phones.map((phone) => (
                    <li key={phone}>
                      <a
                        href={`tel:${phone.replace(/\s/g, "")}`}
                        className="inline-flex items-center gap-1.5 font-mono text-sm tabular hover:text-signal"
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {phone}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* China office gets the same card treatment */}
            <div className="rounded-xl border-2 border-signal/30 bg-card p-6">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-signal/10 text-signal">
                <Warehouse className="h-5 w-5" />
              </span>
              <h3 className="mt-4 font-display text-lg font-semibold">
                Guangzhou warehouse
              </h3>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                China · for your supplier
              </p>
              <p className="mt-3 text-sm font-medium leading-relaxed">
                {COMPANY.chinaOffice.addressCn}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {COMPANY.chinaOffice.rooms}
              </p>
              <ul className="mt-4 space-y-1 border-t pt-3">
                {COMPANY.chinaOffice.phones.slice(0, 2).map((phone) => (
                  <li key={phone}>
                    <a
                      href={`tel:${phone.replace(/\s/g, "")}`}
                      className="inline-flex items-center gap-1.5 font-mono text-sm tabular hover:text-signal"
                    >
                      <Phone className="h-3.5 w-3.5" />
                      {phone}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div></Reveal>
        </div>
      </section>

      {/* Trust + app */}
      <section className="section relative isolate">
        <SectionBackdrop variant="stars" />
        <div className="container">
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border bg-card shadow-soft">
              <Image
                src="https://images.unsplash.com/photo-1566576721346-d4a3b4eaeb55?auto=format&fit=crop&w=1000&q=70"
                alt="Customer collecting a parcel at the counter"
                width={1000}
                height={560}
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="h-56 w-full object-cover"
              />
              <div className="p-6">
                <h3 className="font-display text-xl font-bold tracking-tight">
                  Wateja wetu wanajua tulipo
                </h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  Tuna wafuasi {COMPANY.instagramFollowers} kwenye Instagram, na
                  tunaonyesha send-outs na reviews za wateja kila wiki. Kagua
                  mwenyewe kabla ya kutuma mzigo wako.
                </p>
                <Button asChild variant="outline" className="mt-5 rounded-xl">
                  <a
                    href={COMPANY.instagramUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Instagram className="mr-2 h-4 w-4" />@{COMPANY.instagram}
                  </a>
                </Button>
              </div>
            </div>

            <div className="flex flex-col justify-center rounded-2xl border bg-brand p-8 text-brand-foreground">
              <Smartphone className="h-8 w-8 text-signal" />
              <h3 className="mt-4 font-display text-2xl font-bold tracking-tight">
                Fuatilia mzigo wako kwa simu
              </h3>
              <p className="mt-3 text-sm text-brand-foreground/80">
                Weka namba yako ya mzigo kwenye ukurasa wa kufuatilia — hakuna
                kusubiri majibu ya WhatsApp. Tuna pia app kwa iPhone.
              </p>
              <ul className="mt-5 space-y-2 text-sm">
                {[
                  "Hali ya mzigo wakati wowote",
                  "Batch na tarehe ya kufika",
                  "Taarifa ya kuwa tayari kuchukuliwa",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-signal" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="mt-7 flex flex-wrap gap-3">
                <Button
                  asChild
                  className="rounded-xl bg-background text-foreground hover:bg-background/90"
                >
                  <Link href="/track">Fuatilia mzigo</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="rounded-xl border-brand-foreground/25 bg-transparent text-brand-foreground hover:bg-brand-foreground/10 hover:text-brand-foreground"
                >
                  <a
                    href={COMPANY.iosApp}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    iPhone app
                  </a>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="pb-8">
        <div className="container">
          <div className="relative overflow-hidden rounded-3xl bg-signal px-6 py-14 text-center text-signal-foreground sm:px-12">
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
              <h2 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
                Unatuma mzigo mwezi huu?
              </h2>
              <p className="mt-4 text-signal-foreground/85">
                Tuulize kabla muuzaji wako atume. Tutakupa anwani ya China,
                namba yako ya mteja, na bei ya mzigo wako.
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
                    WhatsApp
                  </a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="h-11 rounded-xl border-signal-foreground/40 bg-transparent px-6 text-signal-foreground hover:bg-signal-foreground/10 hover:text-signal-foreground"
                >
                  <Link href="/contact">Ofisi zetu</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
