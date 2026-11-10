import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown, ArrowLeft, ArrowUpRight, Bot, CreditCard, Database, FolderGit2, Globe, LayoutDashboard, Lock, Mail, MapPin, MessageCircle,
  PenTool, Plug, Smartphone, TrendingUp, Workflow, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CONTACT, EXPERTISE, LIVE, MORE, STACK, type Project } from "./work";
import s from "./nino.module.css";

const TITLE = "Nino — Systems scientist & developer";
const DESCRIPTION = "Websites, mobile apps and business systems, from the first idea to the live product. 14+ platforms delivered for clients in Tanzania & Zambia.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/nino" },
  openGraph: { type: "profile", title: TITLE, description: DESCRIPTION, images: [{ url: "/nino/og.jpg", width: 1200, height: 630, alt: "NINO. — Systems scientist & developer", type: "image/jpeg" }] },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/nino/og.jpg"] },
};
export const viewport: Viewport = { themeColor: "#05070f" };

const ICONS: Record<(typeof EXPERTISE)[number]["icon"], LucideIcon> = {
  Smartphone, Globe, PenTool, LayoutDashboard, Plug, CreditCard, MapPin, Bot, Database, Workflow, TrendingUp,
};
const HELLO = encodeURIComponent("Hi Nino, I found your work through the Target Express Air Cargo website. I have a project in mind —");
const wa = (digits: string) => `https://wa.me/${digits}?text=${HELLO}`;

const wrap = "relative z-10 mx-auto w-full max-w-[1320px] px-4 sm:px-8";
const eyebrow = "font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--faint)]";
const focus = "outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[#05070f]";
const ext = { target: "_blank", rel: "noopener noreferrer" } as const;

/**
 * DEVELOPED BY NINO (owner, 9 Nov 2026: the same page as on the Vegas hotel site, "Developed by Nino" at the foot of
 * the sign-in page, opening a full page of all the projects). Copied from Vegas's /nino. Dark, editorial, the work
 * first: every live project with a screenshot of its real home page, then what's coming and the code, what I do, what
 * I build with, and how to reach me. English only by design: it is Nino's own page, for people looking to hire him.
 * Owner, 9 Nov 2026 (as on ZELab): the inside wears the system's own colours, so the ground is the sign-in
 * scene's night navy, the accent Target's signal red, the solid pills the sign-in button's blue, headings in Sora.
 */
export default function NinoPage() {
  return (
    <div data-nino-page className={cn(s.page, "relative min-h-svh flex-1 overflow-x-clip font-sans antialiased")}>
      {/* ── Top bar ── */}
      <header className="sticky top-0 z-30 border-b border-[var(--rule)] bg-[#05070f]/75 pt-[env(safe-area-inset-top)] backdrop-blur-xl">
        <div className={cn(wrap, "flex h-14 items-center justify-between gap-4")}>
          <a href="#top" className={cn("text-lg font-black tracking-[-0.06em]", focus)}>NINO<span className="text-[var(--accent)]">.</span></a>
          <nav aria-label="Page" className="flex items-center gap-1 sm:gap-2">
            <Link href="/login" className={cn("hidden h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-[var(--muted)] transition-colors hover:text-[var(--ink)] sm:inline-flex", focus)}>
              <ArrowLeft className="size-3.5" aria-hidden="true" />Target Express
            </Link>
            <a href="#work" className={cn("hidden h-9 items-center rounded-full px-3 text-[13px] text-[var(--muted)] transition-colors hover:text-[var(--ink)] md:inline-flex", focus)}>Work</a>
            <a href="#contact" className={cn("inline-flex h-9 items-center rounded-full px-4 text-[13px] font-semibold transition hover:brightness-110", s.fill, focus)}>Work with me</a>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* ── Hero: compact — the name, one line on what I do, and the way in; the work starts just below. ── */}
        <section className={cn(wrap, "pb-10 pt-10 sm:pb-14 sm:pt-16")}>
          <div className="grid items-end gap-8 lg:grid-cols-[auto_minmax(0,1fr)] lg:gap-16">
            <div>
              <p className={cn(eyebrow, s.rise)}>Systems scientist &amp; developer</p>
              <h1 className={cn(s.wordmark, s.rise, s.rise2, "mt-4 select-none")} aria-label="Nino">
                NINO<span className="text-[var(--accent)]">.</span>
              </h1>
            </div>
            <div className={cn(s.rise, s.rise3, "lg:pb-3")}>
              <p className="max-w-xl text-pretty text-lg leading-snug text-[var(--ink)] sm:text-xl">
                Before I design a screen, I map how the business really works — who does what, where the money goes.
                <span className="text-[var(--muted)]"> Then I design the system and build it around that.</span>
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                <a href="#work" className={cn("inline-flex h-11 items-center gap-2 rounded-full bg-[var(--ink)] px-5 text-sm font-semibold text-[#05070f] transition hover:bg-white", focus)}>
                  See the work<ArrowDown className="size-4" aria-hidden="true" />
                </a>
                <a href={wa(CONTACT.whatsapp[0].digits)} {...ext} className={cn("inline-flex h-11 items-center gap-2 rounded-full border border-[var(--rule)] px-5 text-sm font-semibold transition-colors hover:border-[var(--muted)]", focus)}>
                  <MessageCircle className="size-4" aria-hidden="true" />WhatsApp me<span className="sr-only"> (opens WhatsApp)</span>
                </a>
                <span className="inline-flex items-center gap-2 px-1 text-[13px] text-[var(--muted)]">
                  <span className={cn(s.pulse, "size-2 rounded-full bg-[var(--accent)]")} aria-hidden="true" />Available for select projects
                </span>
              </div>
            </div>
          </div>

          {/* The facts, as given — nothing rounded up; small, one line. */}
          <dl className={cn(s.rise, s.rise3, "mt-10 flex flex-wrap gap-x-8 gap-y-3 border-y border-[var(--rule)] py-4 sm:gap-x-12")}>
            {[
              { big: "14+", small: "platforms delivered" },
              { big: String(LIVE.length), small: "sites live right now" },
            ].map((f) => (
              <div key={f.small} className="flex items-baseline gap-2.5">
                <dd className="text-xl font-black tracking-[-0.03em] sm:text-2xl">{f.big}</dd>
                <dt className="order-2 text-[13px] text-[var(--muted)]">{f.small}</dt>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Live work ── */}
        <section id="work" aria-labelledby="work-title" className={cn(wrap, "scroll-mt-20 py-10 sm:py-16")}>
          <SectionHead id="work-title" index="01" title="Live work" note={`${LIVE.length} sites in production — tap one to visit it.`} />
          <ul className="mt-10 grid gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
            {LIVE.map((p, i) => <ProjectCard key={p.name} p={p} featured={i === 0} priority={i < 3} />)}
          </ul>
        </section>

        {/* ── Coming next & on GitHub ── */}
        <section aria-labelledby="more-title" className={cn(wrap, "py-10 sm:py-16")}>
          <SectionHead id="more-title" index="02" title="More work" note="Launching soon, code you can read, and private projects." />
          <ul className="mt-10 grid gap-4 sm:gap-5 md:grid-cols-2">
            {MORE.map((p) => <MoreCard key={p.name} p={p} />)}
          </ul>
        </section>

        {/* ── What I do & what I build with ── */}
        <section aria-labelledby="do-title" className={cn(wrap, "py-10 sm:py-16")}>
          <SectionHead id="do-title" index="03" title="What I do" note="One person from the business question to the shipped product." />
          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-16">
            <div>
              <ul className="grid grid-cols-2 gap-2">
                {EXPERTISE.map((e, i) => {
                  const Icon = ICONS[e.icon];
                  return (
                    <li key={e.label} className={cn("flex items-center gap-2.5 rounded-2xl border border-[var(--rule)] bg-[var(--card)] px-3 py-3 text-[13.5px] leading-tight sm:gap-3 sm:px-4 sm:py-3.5 sm:text-[15px]", i === EXPERTISE.length - 1 && EXPERTISE.length % 2 === 1 && "col-span-2")}>
                      <Icon className="size-[18px] shrink-0 text-[var(--accent)]" strokeWidth={1.6} aria-hidden="true" />{e.label}
                    </li>
                  );
                })}
              </ul>
            </div>
            <div>
              <p className={eyebrow}>Built with</p>
              <table className="mt-4 w-full border-collapse text-left">
                <caption className="sr-only">Technologies by area</caption>
                <tbody>
                  {STACK.map((r) => (
                    <tr key={r.area} className="border-t border-[var(--rule)] last:border-b">
                      <th scope="row" className="w-[38%] py-4 pr-4 align-top text-sm font-normal text-[var(--faint)]">{r.area}</th>
                      <td className="py-4 text-[15px] leading-relaxed">{r.tools.join(" · ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-6 text-sm leading-relaxed text-[var(--faint)]">
                Mobile money, maps, messaging and AI wired into real operations — not demos.
              </p>
            </div>
          </div>
        </section>

        {/* ── Work with me ── */}
        <section id="contact" aria-labelledby="contact-title" className={cn(wrap, "scroll-mt-20 pb-16 pt-10 sm:pb-24 sm:pt-16")}>
          <div className="relative overflow-hidden rounded-[2rem] border border-[var(--rule)] bg-[linear-gradient(140deg,rgb(231_64_73/0.15),rgb(86_148_230/0.08)_45%,rgb(255_255_255/0.02))] p-6 sm:p-12">
            <p className={eyebrow}>04 — Work with me</p>
            <h2 id="contact-title" className="mt-4 max-w-3xl text-balance text-4xl font-black leading-[0.95] tracking-[-0.045em] sm:text-6xl">
              Have something to build? Let&apos;s talk<span className="text-[var(--accent)]">.</span>
            </h2>
            <p className="mt-5 max-w-xl text-[17px] leading-relaxed text-[var(--muted)]">
              Tell me what the business needs. I&apos;ll come back with how I&apos;d build it, how long it takes and what it costs.
              Available for select projects.
            </p>
            <ul className="mt-9 grid gap-3 md:grid-cols-3">
              <li>
                <a href={`mailto:${CONTACT.email}?subject=${encodeURIComponent("A project for Nino")}`} className={cn(s.card, "group flex h-full items-center gap-4 rounded-2xl border border-[var(--rule)] bg-[#05070f]/60 p-4 sm:p-5", focus)}>
                  <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[var(--ink)] text-[#05070f]"><Mail className="size-[18px]" aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs text-[var(--faint)]">Email</span>
                    <span className="block truncate text-[15px] font-semibold">{CONTACT.email}</span>
                  </span>
                  <ArrowUpRight className={cn(s.arrow, "size-4 shrink-0 text-[var(--faint)]")} aria-hidden="true" />
                </a>
              </li>
              {CONTACT.whatsapp.map((w) => (
                <li key={w.place}>
                  <a href={wa(w.digits)} {...ext} className={cn(s.card, "group flex h-full items-center gap-4 rounded-2xl border border-[var(--rule)] bg-[#05070f]/60 p-4 sm:p-5", focus)}>
                    <span className="grid size-11 shrink-0 place-items-center rounded-full bg-[#25D366] text-[#06351b]"><MessageCircle className="size-[18px]" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs text-[var(--faint)]">WhatsApp · {w.place}</span>
                      <span className="block truncate text-[15px] font-semibold tabular-nums">{w.shown}</span>
                    </span>
                    <ArrowUpRight className={cn(s.arrow, "size-4 shrink-0 text-[var(--faint)]")} aria-hidden="true" />
                    <span className="sr-only"> (opens WhatsApp)</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-[var(--rule)]">
        <div className={cn(wrap, "flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-[13px] text-[var(--faint)]")}>
          <p><span className="font-black tracking-[-0.06em] text-[var(--ink)]">NINO<span className="text-[var(--accent)]">.</span></span> · © {new Date().getFullYear()} · Designed &amp; built by Nino</p>
          <Link href="/login" className={cn("inline-flex min-h-11 items-center gap-1.5 transition-colors hover:text-[var(--ink)]", focus)}>
            <ArrowLeft className="size-3.5" aria-hidden="true" />Back to Target Express
          </Link>
        </div>
      </footer>
    </div>
  );
}

function SectionHead({ id, index, title, note }: { id: string; index: string; title: string; note: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3 border-b border-[var(--rule)] pb-5">
      <h2 id={id} className="flex items-baseline gap-4 text-3xl font-black tracking-[-0.045em] sm:text-5xl">
        <span className="font-mono text-xs font-normal tracking-[0.2em] text-[var(--faint)]">{index}</span>{title}
      </h2>
      <p className="text-sm text-[var(--muted)]">{note}</p>
    </div>
  );
}

/** A browser window around the live site's home page. */
function Shot({ p, priority, sizes }: { p: Project; priority?: boolean; sizes: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--rule)] bg-[#141416]">
      <div className="flex h-7 items-center gap-1.5 border-b border-[var(--rule)] px-3">
        <span className="size-2 rounded-full bg-white/15" /><span className="size-2 rounded-full bg-white/15" /><span className="size-2 rounded-full bg-white/15" />
        <span className="ml-2 min-w-0 flex-1 truncate rounded-md bg-white/[0.05] px-2 py-0.5 text-center font-mono text-[10px] text-[var(--faint)]">{p.domain}</span>
      </div>
      <div className={cn(s.shot, "relative aspect-[16/10] overflow-hidden")}>
        <Image src={p.shot!} alt={`${p.name} — the live home page`} fill sizes={sizes} priority={priority} className="object-cover object-top" />
      </div>
    </div>
  );
}

function ProjectCard({ p, featured, priority }: { p: Project; featured?: boolean; priority?: boolean }) {
  return (
    <li className={cn(featured && "md:col-span-2")}>
      <a href={p.url} {...ext} className={cn(s.card, "group flex h-full flex-col gap-5 rounded-3xl border border-[var(--rule)] bg-[var(--card)] p-3 sm:p-4", featured && "xl:flex-row xl:items-stretch", focus)}>
        <div className={cn(featured && "xl:w-[62%] xl:shrink-0")}>
          <Shot p={p} priority={priority} sizes={featured ? "(min-width: 1280px) 560px, (min-width: 768px) 90vw, 100vw" : "(min-width: 1280px) 400px, (min-width: 768px) 45vw, 100vw"} />
        </div>
        <div className={cn("flex flex-1 flex-col px-1.5 pb-1.5", featured && "xl:justify-between xl:py-2 xl:pr-3")}>
          <div>
            {featured && <p className={cn(s.fill, "mb-3 inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold")}><MapPin className="size-3" aria-hidden="true" />You are here</p>}
            <p className="font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--faint)]">{p.kind}</p>
            <h3 className={cn("mt-2 flex items-start justify-between gap-3 font-bold tracking-[-0.03em]", featured ? "text-3xl sm:text-4xl" : "text-xl")}>
              {/* A project with an official logo shows it as its title, as the owner's own copy does (ZELab, 10 Nov 2026):
                  the file as it is, no background or effect, the name kept as its alt text. */}
              {p.logo ? (
                // eslint-disable-next-line @next/next/no-img-element -- an SVG logo, drawn as it is
                <img src={p.logo} alt={p.name} width={678} height={264} className={cn("w-auto", featured ? "h-14 sm:h-[4.5rem]" : "h-10")} />
              ) : (
                p.name
              )}
              <ArrowUpRight className={cn(s.arrow, "mt-1 size-5 shrink-0 text-[var(--faint)] group-hover:text-[var(--accent)]")} aria-hidden="true" />
            </h3>
            <p className={cn("mt-2.5 text-pretty leading-relaxed text-[var(--muted)]", featured ? "text-base sm:text-[17px]" : "text-[14.5px]")}>{p.line}</p>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-1.5">
            {p.tags.map((t) => <span key={t} className="rounded-full border border-[var(--rule)] px-2.5 py-1 text-[11.5px] text-[var(--muted)]">{t}</span>)}
          </div>
        </div>
        <span className="sr-only"> — visit {p.domain} (opens in a new tab)</span>
      </a>
    </li>
  );
}

function MoreCard({ p }: { p: Project }) {
  const soon = p.status === "soon";
  const priv = !p.url;
  const box = cn(s.card, "group flex h-full gap-4 rounded-3xl border border-[var(--rule)] bg-[var(--card)] p-5 sm:items-center sm:gap-5 sm:p-6", p.shot ? "flex-col sm:flex-row" : "flex-row items-start");
  const inner = (
    <>
      {p.shot ? (
        <div className="sm:w-[44%] sm:shrink-0"><Shot p={p} sizes="(min-width: 768px) 260px, 100vw" /></div>
      ) : (
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-[var(--rule)] bg-white/[0.04]">
          {priv
            ? <Lock className="size-5 text-[var(--accent)]" strokeWidth={1.6} aria-hidden="true" />
            : <FolderGit2 className="size-5 text-[var(--accent)]" strokeWidth={1.6} aria-hidden="true" />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--faint)]">
          {soon && <span className={cn(s.fill, "rounded-full px-2 py-0.5 font-sans text-[10.5px] font-semibold normal-case tracking-normal")}>Launching soon</span>}
          {p.kind}
        </p>
        <h3 className="mt-2 flex items-start justify-between gap-3 text-xl font-bold tracking-[-0.03em]">
          {p.name}
          {!priv && <ArrowUpRight className={cn(s.arrow, "mt-1 size-5 shrink-0 text-[var(--faint)] group-hover:text-[var(--accent)]")} aria-hidden="true" />}
        </h3>
        <p className="mt-2 text-pretty text-[14.5px] leading-relaxed text-[var(--muted)]">{p.line}</p>
        {priv && p.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {p.tags.map((t) => <span key={t} className="rounded-full border border-[var(--rule)] px-2.5 py-1 text-[11.5px] text-[var(--muted)]">{t}</span>)}
          </div>
        )}
        <p className="mt-3 truncate font-mono text-[11px] text-[var(--faint)]">{priv ? "Private project" : soon ? `Preview · ${p.domain}` : p.domain}</p>
      </div>
    </>
  );
  return (
    <li>
      {priv ? (
        <div className={box}>{inner}</div>
      ) : (
        <a href={p.url} {...ext} className={cn(box, focus)}>
          {inner}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </li>
  );
}
