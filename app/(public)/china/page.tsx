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
import { Button } from "@/components/ui/button";
import { COMPANY } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Anwani ya China · China warehouse address",
  description:
    "The Target Express warehouse address in Guangzhou, in Chinese and English — send it to your supplier so they can deliver your cargo.",
};

const CHINA_FULL = `${COMPANY.chinaOffice.addressCn}\n${COMPANY.chinaOffice.rooms}\nTel: ${COMPANY.chinaOffice.phones[0]}`;

export default function ChinaPage() {
  return (
    <div className="container py-12 md:py-16">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <p className="text-sm font-bold uppercase tracking-wider text-signal">
            Anwani ya warehouse yetu China
          </p>
          <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">
            Mpe muuzaji wako anwani hii
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
            Tuma anwani hii kwa muuzaji wako (supplier) kwa WeChat au WhatsApp.
            Ni ya Kichina — ndio wanayoihitaji wafikishe mzigo wako.
            <span className="mt-2 block text-sm">
              Send this address to your supplier in China. They deliver your
              cargo to us, and we fly it to Dar es Salaam.
            </span>
          </p>
        </div>

        {/* The address card — the reason this page exists */}
        <div className="mt-10 overflow-hidden rounded-2xl border-2 border-signal/30 bg-card shadow-lift">
          <div className="bg-signal px-6 py-3">
            <p className="text-sm font-bold uppercase tracking-widest text-signal-foreground">
              收货地址 · Delivery address
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
              <Button asChild variant="outline" className="rounded-xl">
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

        {/* What the supplier must write on the cargo */}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Mwambie muuzaji aandike hivi kwenye mzigo
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Tell your supplier to mark the cargo clearly. Without your name and
            phone number on the boxes, we cannot tell whose cargo it is.
          </p>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              {
                icon: UserRound,
                title: "Jina lako",
                body: "Your name or business name, as we know you.",
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
            ].map(({ icon: Icon, title, body }) => (
              <div key={title} className="rounded-xl border bg-card p-5">
                <Icon className="h-5 w-5 text-signal" />
                <h3 className="mt-3 font-display font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-10 overflow-hidden rounded-2xl border shadow-soft">
          <Image
            src="https://images.unsplash.com/photo-1595246140625-573b715d11dc?auto=format&fit=crop&w=1200&q=70"
            alt="Labelled cartons ready for dispatch"
            width={1200}
            height={500}
            sizes="(max-width: 768px) 100vw, 768px"
            className="h-48 w-full object-cover sm:h-60"
          />
        </div>

        {/* Warnings */}
        <section className="mt-12 rounded-xl border border-warning/40 bg-warning/5 p-6">
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
        </section>

        {/* Tanzania side */}
        <section className="mt-12">
          <h2 className="font-display text-2xl font-bold tracking-tight">
            Ofisi zetu Tanzania
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Hapa ndipo unachukua mzigo wako baada ya kufika.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {COMPANY.offices.map((office) => (
              <div key={office.id} className="rounded-xl border bg-card p-5">
                <Building2 className="h-5 w-5 text-brand" />
                <h3 className="mt-3 font-display font-semibold">
                  {office.name}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {office.address}
                </p>
                <ul className="mt-3 space-y-1 border-t pt-3">
                  {office.phones.map((phone) => (
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
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild variant="signal" className="rounded-xl">
              <Link href="/china/markets">Masoko ya China</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/track">Fuatilia mzigo wako</Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl">
              <Link href="/contact">Wasiliana nasi</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
