import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import {
  AlertTriangle,
  Building2,
  MessageCircle,
  Package,
  Phone,
  UserRound,
} from "lucide-react";

import { CopyField } from "@/components/site/copy-field";
import { MediaBand } from "@/components/site/media-card";
import { PageHero } from "@/components/site/page-hero";
import { SectionBackdrop } from "@/components/site/section-backdrop";
import { Button } from "@/components/ui/button";
import { COMPANY } from "@/lib/constants";
import { IMAGES, img } from "@/lib/imagery";

export const metadata: Metadata = {
  title: "Anwani ya China · China warehouse address",
  description:
    "The Target Express warehouse address in Guangzhou, in Chinese and English — send it to your supplier so they can deliver your cargo.",
};

const CHINA_FULL = `${COMPANY.chinaOffice.addressCn}\n${COMPANY.chinaOffice.rooms}\nTel: ${COMPANY.chinaOffice.phones[0]}`;

const MARKINGS = [
  {
    icon: UserRound,
    title: "Jina lako / shipping mark",
    body: "Your name or shipping mark, exactly as we know you. This is what we match the cartons against.",
  },
  {
    icon: Phone,
    title: "Namba yako ya simu",
    body: "The Tanzanian number you use with us — this is how we find you in the system.",
  },
  {
    icon: Package,
    title: "Idadi ya vipande",
    body: "How many cartons or bags, so we can check nothing is missing.",
  },
];

export default function ChinaPage() {
  return (
    <>
      {/* The address card is the reason this page exists, so it opens the page
          rather than sitting below a banner: photograph on the left, the thing
          you came to copy on the right. */}
      <PageHero
        image={IMAGES.warehouseAisle}
        eyebrow="Anwani ya warehouse yetu China"
        /* The owner's own wording. "Supplier" and "Address" in English inside a
           Swahili sentence is how the customers of this business actually talk
           about it — the words they use with their own suppliers. */
        title="Mpe Supplier wako Address hii"
        body={
          <>
            Tuma anwani hii kwa muuzaji wako (supplier) kwa WeChat au WhatsApp.
            Ni ya Kichina — ndio wanayoihitaji wafikishe mzigo wako.
            <span className="mt-2 block text-sm text-white/55">
              Send this address to your supplier in China. They deliver your
              cargo to us, and we fly it to Dar es Salaam.
            </span>
          </>
        }
        aside={
          /* `text-foreground` is not decoration: the hero sets `text-white` on
             everything inside it, and this is a light card. Without the reset,
             the Chinese address and the phone numbers would be white on white. */
          <div className="overflow-hidden rounded-2xl border-2 border-signal/40 bg-card text-foreground shadow-lift ring-1 ring-gold/20">
            <div className="bg-signal px-6 py-3">
              {/* The Chinese stays 收货地址 — "receiving address" is what a
                  supplier in Guangzhou reads and acts on. The English says
                  whose address it is: ours, in China. "Delivery address" read
                  like where the cargo was going, which is the opposite of what
                  this card is for. */}
              <p className="text-sm font-bold uppercase tracking-widest text-signal-foreground">
                收货地址 · China warehouse address
              </p>
            </div>

            <div className="p-6 sm:p-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                地址 / Address
              </p>
              <p className="mt-2 select-all font-display text-xl font-bold leading-relaxed sm:text-2xl">
                {COMPANY.chinaOffice.addressCn}
              </p>

              <p className="mt-4 text-sm text-muted-foreground">
                {COMPANY.chinaOffice.addressEn}
                <br />
                <span className="font-medium text-foreground">
                  {COMPANY.chinaOffice.rooms}
                </span>
              </p>

              <div className="mt-6 border-t pt-5">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  电话 / Phone — China office
                </p>
                <ul className="mt-2 grid gap-2 sm:grid-cols-3">
                  {COMPANY.chinaOffice.phones.map((phone) => (
                    <li key={phone}>
                      <a
                        href={`tel:${phone.replace(/\s/g, "")}`}
                        className="inline-flex items-center gap-1.5 font-mono text-sm tabular hover:text-signal"
                      >
                        <Phone className="h-3.5 w-3.5 shrink-0" />
                        {phone}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 flex flex-wrap gap-3 border-t pt-5">
                <CopyField
                  value={CHINA_FULL}
                  label="Copy anwani / 复制地址"
                  copiedLabel="Imekopiwa"
                />
                <Button
                  asChild
                  variant="outline"
                  className="rounded-xl text-foreground"
                >
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(CHINA_FULL)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Tuma kwa WhatsApp
                  </a>
                </Button>
              </div>
            </div>
          </div>
        }
      />

      {/* What the supplier must write on the cargo */}
      <section className="section relative isolate">
        <SectionBackdrop variant="aurora" />
        <div className="container">
          <div className="mx-auto max-w-3xl">
            <h2 className="rule-gold font-display text-2xl font-bold tracking-tight sm:text-3xl">
              Mwambie muuzaji aandike hivi kwenye mzigo
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Tell your supplier to mark the cargo clearly. Without your name and
              phone number on the boxes, we cannot tell whose cargo it is.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {MARKINGS.map(({ icon: Icon, title, body }) => (
                <div
                  key={title}
                  className="rounded-2xl border bg-card/80 p-5 shadow-soft backdrop-blur transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-gold/45 hover:shadow-lift motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-signal/10 text-signal">
                    <Icon className="h-5 w-5" />
                  </span>
                  <h3 className="mt-4 font-display font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* A breath between two dense blocks — what a correctly marked shipment
          actually looks like on our floor. */}
      <section className="relative isolate py-10 md:py-14">
        <SectionBackdrop variant="stars" />
        <div className="container">
          <div className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-gold/25 shadow-lift">
            <Image
              src={img(IMAGES.cargoHold, 1400)}
              alt="Labelled cartons ready for dispatch"
              width={1400}
              height={600}
              sizes="(max-width: 1024px) 100vw, 896px"
              className="h-52 w-full object-cover sm:h-72"
            />
          </div>
        </div>
      </section>

      {/* Warnings */}
      <section className="section relative isolate">
        <SectionBackdrop variant="aurora" />
        <div className="container">
          <div className="mx-auto max-w-3xl rounded-2xl border border-warning/40 bg-warning/5 p-6 shadow-soft backdrop-blur sm:p-8">
            <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-warning">
              <AlertTriangle className="h-5 w-5" />
              Vitu tusiyoweza kusafirisha
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Airlines and Tanzanian customs prohibit these. If you are not sure,
              ask us <span className="font-medium">before</span> your supplier
              ships:
            </p>
            <ul className="mt-3 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
              {[
                "Betri zinazosafirishwa peke yake (loose batteries)",
                "Vitu vinavyoweza kuwaka au kulipuka",
                "Bidhaa za kughushi (counterfeit brands)",
                "Kemikali na maji yenye hatari",
              ].map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-warning">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Tanzania side — the page closes on the other end of the route.
          Everything inside this band is explicitly white-on-ink, because
          MediaBand is a dark section. */}
      <MediaBand
        image={IMAGES.apron}
        title="Ofisi zetu Tanzania"
        body="Hapa ndipo unachukua mzigo wako baada ya kufika."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          {COMPANY.offices.map((office) => (
            <div
              key={office.id}
              className="rounded-2xl border border-white/15 bg-white/[0.06] p-5 backdrop-blur"
            >
              <Building2 className="h-5 w-5 text-gold" />
              <h3 className="mt-3 font-display font-semibold text-white">
                {office.name}
              </h3>
              <p className="mt-1 text-sm text-white/65">{office.address}</p>
              <ul className="mt-3 space-y-1 border-t border-white/10 pt-3">
                {office.phones.map((phone) => (
                  <li key={phone}>
                    <a
                      href={`tel:${phone.replace(/\s/g, "")}`}
                      className="font-mono text-sm tabular text-white/80 hover:text-gold"
                    >
                      {phone}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <Button asChild variant="signal" className="rounded-xl">
            <Link href="/china/markets">Masoko ya China</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="rounded-xl border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <Link href="/track">Fuatilia mzigo wako</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="rounded-xl border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white"
          >
            <Link href="/contact">Wasiliana nasi</Link>
          </Button>
        </div>
      </MediaBand>
    </>
  );
}
