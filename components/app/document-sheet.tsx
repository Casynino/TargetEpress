import type { ReactNode } from "react";

import { BrandLogo, BrandMark } from "@/components/brand-mark";
import { COMPANY } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * The paper every Target Express document is printed on.
 *
 * There were three of these — an invoice, a pickup note and a batch manifest —
 * and each had grown its own header, its own rules and its own idea of how big
 * the company name should be. Three documents that look like three companies is
 * what a customer sees when they get a bill from one desk and a collection slip
 * from another, so the furniture now lives in one place and the documents
 * differ only where they actually differ.
 *
 * Always white, always black text, in either theme. These sheets are printed,
 * photographed and forwarded on WhatsApp; a document that inverts with the
 * staff member's theme preference is a document that arrives grey.
 *
 * Brand colours are written out rather than tokenised for the same reason: the
 * tokens shift with the theme so the sidebar mark stays readable, and this
 * paper never does.
 */

export const DOC_NAVY = "#182A48";
export const DOC_RED = "#D81E2A";

export function DocumentSheet({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <article
      className={cn(
        "print-plain relative isolate overflow-hidden rounded-xl border-2 bg-white p-8 text-black shadow-soft",
        className
      )}
    >
      {/* The brand rule. Two inks in the proportion the logo uses them. */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 z-10 h-1.5 bg-[#182A48]"
      />
      <span aria-hidden className="absolute left-0 top-0 z-10 h-1.5 w-32 bg-[#D81E2A]" />

      {/* The mark, ghosted, behind the content. An inline SVG rather than a CSS
          background: background images are dropped by default when a browser
          prints, and a watermark that only exists on screen is decoration
          pretending to be provenance. */}
      <BrandMark
        tone="paper"
        className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-56 w-auto -translate-x-1/2 -translate-y-1/2 opacity-[0.045]"
      />

      <div className="relative">{children}</div>
    </article>
  );
}

/**
 * Logo, document name, reference.
 *
 * The lockup rather than the mark plus the company name set in our type: this
 * page leaves the building, and the registered artwork is the thing with legal
 * standing on it.
 */
export function DocumentHeader({
  title,
  meta,
  badge,
}: {
  /** "Invoice", "Pickup note", "Batch manifest". */
  title: string;
  /** The right-hand column: reference number, dates, contacts. */
  meta: ReactNode;
  /** Optional status stamp — PAID, VOID, RELEASED. */
  badge?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#182A48] pb-5">
      <div>
        <BrandLogo className="h-14 w-auto" />
        <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#182A48]">
          {title}
        </p>
      </div>
      <div className="text-right">
        {badge ? <div className="mb-2 flex justify-end">{badge}</div> : null}
        <div className="text-[11px] leading-relaxed">{meta}</div>
      </div>
    </header>
  );
}

/**
 * A status stamp.
 *
 * Outlined rather than filled: somebody sorting a pile of printouts needs to
 * read this across a desk, and an outline survives a photocopier and a bad
 * phone photograph better than reversed-out white type.
 */
export function DocumentStamp({
  children,
  tone = "danger",
}: {
  children: ReactNode;
  tone?: "danger" | "warning" | "success" | "neutral";
}) {
  // Written out. Tailwind reads source text, so an interpolated class name is
  // a class that never gets generated.
  const TONE = {
    danger: "border-[#D81E2A] text-[#D81E2A]",
    warning: "border-[#A86A08] text-[#A86A08]",
    success: "border-[#117447] text-[#117447]",
    neutral: "border-[#182A48] text-[#182A48]",
  } as const;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border-2 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.14em]",
        TONE[tone]
      )}
    >
      {children}
    </span>
  );
}

/** A titled block. Every field on every document is labelled the same way. */
export function DocumentField({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-black/50">
        {label}
      </p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

/**
 * The strip of facts under the header — weight, quantity, cargo, and whatever
 * else the document is about. A tinted band so it reads as reference data
 * rather than as part of the argument the document is making.
 */
export function DocumentFacts({
  items,
}: {
  items: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="mt-6 grid grid-cols-2 gap-4 rounded-lg bg-black/[0.035] px-5 py-4 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-[9px] font-semibold uppercase tracking-[0.18em] text-black/50">
            {item.label}
          </dt>
          <dd className="mt-0.5 text-[13px] font-bold">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function DocumentFooter({ children }: { children?: ReactNode }) {
  return (
    <footer className="mt-7 border-t border-black/20 pt-3 text-[10px] leading-relaxed text-black/60">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p className="text-[11px] font-bold text-[#182A48]">{COMPANY.name}</p>
          <p className="font-bold tracking-[0.08em] text-[#D81E2A]">
            KWETU MUDA NI MALI
          </p>
        </div>
        <div className="text-right">
          <p>
            {COMPANY.phone} · {COMPANY.email}
          </p>
          <p>{COMPANY.darAddress}</p>
        </div>
      </div>
      {children ? <div className="mt-2">{children}</div> : null}
    </footer>
  );
}
