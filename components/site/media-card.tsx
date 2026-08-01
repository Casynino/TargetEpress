import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { img } from "@/lib/imagery";
import { cn } from "@/lib/utils";

/**
 * A card with a photograph in it.
 *
 * The single component this site was missing. Everything was a rounded
 * rectangle containing an icon and two paragraphs, twelve times down the page,
 * and no amount of adjusting the grey made that look like anything but a form.
 *
 * The photograph does three jobs at once: it tells you what the card is about
 * before you read it, it gives the page a rhythm that text alone cannot, and it
 * makes a freight company look like a freight company rather than a brochure.
 *
 * Sizes exist because a bento grid needs them. A page of identically sized
 * cards is a table with rounded corners; varying the span is what makes a
 * layout read as designed rather than generated.
 */
export type MediaCardSize = "wide" | "tall" | "standard";

const SPAN: Record<MediaCardSize, string> = {
  wide: "sm:col-span-2",
  tall: "row-span-2",
  standard: "",
};

const MEDIA_HEIGHT: Record<MediaCardSize, string> = {
  wide: "h-56 sm:h-64",
  tall: "h-56 sm:h-80",
  standard: "h-44",
};

/** Requested render width, so the browser is not handed a 2000px file. */
const MEDIA_WIDTH: Record<MediaCardSize, number> = {
  wide: 1200,
  tall: 800,
  standard: 700,
};

export function MediaCard({
  href,
  image,
  eyebrow,
  title,
  body,
  cta,
  size = "standard",
  priority = false,
  className,
  children,
}: {
  href: string;
  image: string;
  eyebrow?: string;
  title: string;
  body?: string;
  cta?: string;
  size?: MediaCardSize;
  /** Only for cards above the fold — everything else lazy-loads. */
  priority?: boolean;
  className?: string;
  children?: React.ReactNode;
}) {
  const external = href.startsWith("http");
  const Wrapper = external ? "a" : Link;

  return (
    <Wrapper
      href={href}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border bg-card shadow-soft",
        // 1.02 rather than something dramatic: a card that leaps is a card
        // that fights the one next to it.
        "transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1 hover:border-gold/50 hover:shadow-lift",
        "motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        SPAN[size],
        className
      )}
    >
      <div className={cn("relative overflow-hidden", MEDIA_HEIGHT[size])}>
        <Image
          src={img(image, MEDIA_WIDTH[size])}
          alt=""
          fill
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
        {/* Scrim, so the eyebrow stays readable whatever the photograph does. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-[hsl(var(--ink)/0.92)] via-[hsl(var(--ink)/0.25)] to-transparent"
        />
        {eyebrow ? (
          <span className="absolute left-4 top-4 rounded-full border border-gold/40 bg-[hsl(var(--ink)/0.62)] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold backdrop-blur">
            {eyebrow}
          </span>
        ) : null}
        <h3 className="absolute inset-x-4 bottom-3 font-display text-lg font-bold leading-tight text-white drop-shadow">
          {title}
        </h3>
      </div>

      <div className="flex flex-1 flex-col p-5">
        {body ? (
          <p className="flex-1 text-sm leading-relaxed text-muted-foreground">
            {body}
          </p>
        ) : null}
        {children}
        {cta ? (
          <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand">
            {cta}
            <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0 motion-reduce:group-hover:translate-y-0" />
          </span>
        ) : null}
      </div>
    </Wrapper>
  );
}

/**
 * A full-width band with a photograph behind it.
 *
 * For the moments a page needs to breathe — between two dense grids, or as the
 * thing that ends a page. Text sits on a scrim heavy enough to stay legible on
 * any photograph, because these get swapped.
 */
export function MediaBand({
  image,
  eyebrow,
  title,
  body,
  children,
  align = "left",
  className,
}: {
  image: string;
  eyebrow?: string;
  title: string;
  body?: string;
  children?: React.ReactNode;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative overflow-hidden bg-[hsl(var(--ink))] py-20 text-white sm:py-24 [&:first-child]:pt-28 sm:[&:first-child]:pt-36",
        className
      )}
    >
      <Image
        src={img(image, 1800)}
        alt=""
        fill
        sizes="100vw"
        className="object-cover"
      />
      <div
        aria-hidden
        className={cn(
          "absolute inset-0",
          align === "center"
            ? "bg-[hsl(var(--ink)/0.82)]"
            : "bg-gradient-to-r from-[hsl(var(--ink)/0.95)] via-[hsl(var(--ink)/0.8)] to-[hsl(var(--ink)/0.35)]"
        )}
      />
      <div className="container relative">
        <div className={cn(align === "center" && "mx-auto max-w-2xl text-center")}>
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-[1.1] sm:text-4xl">
            {title}
          </h2>
          {body ? (
            <p
              className={cn(
                "mt-4 max-w-xl text-lg text-white/70",
                align === "center" && "mx-auto"
              )}
            >
              {body}
            </p>
          ) : null}
          {children ? <div className="mt-8">{children}</div> : null}
        </div>
      </div>
    </section>
  );
}
