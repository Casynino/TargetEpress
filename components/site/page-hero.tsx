import Image from "next/image";

import { img } from "@/lib/imagery";
import { cn } from "@/lib/utils";

/**
 * The top of every page that is not the homepage.
 *
 * Before this existed, each page opened with its own hand-rolled dark band —
 * a gradient over flat navy, a heading, a paragraph. Nine pages, nine slightly
 * different versions of the same idea, and every one of them read as empty
 * because there was nothing in it but words.
 *
 * One component fixes both problems at once. Every page now opens on a
 * photograph of the actual business, and changing how a page opens is one edit
 * rather than nine.
 *
 * The `aside` slot exists because some of these pages lead with a form — the
 * booking and pickup pages should not push their form below a full-height
 * banner just to get a picture on the screen.
 */
export function PageHero({
  image,
  backdrop,
  eyebrow,
  title,
  body,
  children,
  aside,
  size = "standard",
  className,
}: {
  /** Ignored when `backdrop` is given. */
  image?: string;
  /**
   * Something drawn instead of the photograph.
   *
   * One page has a better answer than a picture: tracking, where the backdrop
   * is the corridor the customer's box is on. The scrims below belong to the
   * photograph, so a backdrop brings its own — see TrackingSky.
   */
  backdrop?: React.ReactNode;
  eyebrow: string;
  title: React.ReactNode;
  body?: React.ReactNode;
  /** Buttons, usually. Sits under the body copy. */
  children?: React.ReactNode;
  /** A form or panel beside the copy, instead of under it. */
  aside?: React.ReactNode;
  size?: "standard" | "tall";
  className?: string;
}) {
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden bg-[hsl(var(--ink))] text-white",
        size === "tall" ? "pb-24 pt-32 sm:pb-32 sm:pt-40" : "pb-20 pt-28 sm:pb-24 sm:pt-36",
        className
      )}
    >
      {backdrop ?? (
        <Image
          src={img(image ?? "", 1920)}
          alt=""
          fill
          priority
          sizes="100vw"
          className="-z-10 object-cover"
        />
      )}

      {/* Two scrims doing different jobs: the first guarantees legibility on
          the left where the text sits, the second stops white type landing on
          a bright patch of sky.

          They are deliberately weaker on the right. Stacked at full strength
          they multiply — 0.45 over 0.55 leaves almost nothing of the
          photograph — and the hero goes back to being flat navy, which is the
          exact problem the photograph was added to solve. */}
      {backdrop ? null : (
        <>
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-r from-[hsl(var(--ink)/0.94)] via-[hsl(var(--ink)/0.62)] to-[hsl(var(--ink)/0.15)]"
          />
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-t from-[hsl(var(--ink)/0.72)] via-transparent to-[hsl(var(--ink)/0.3)]"
          />
        </>
      )}
      {/* A wash of gold along the bottom edge — the accent that separates this
          from every other navy hero on the internet. */}
      {backdrop ? null : (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-[hsl(var(--gold)/0.14)] to-transparent"
        />
      )}

      <div
        className={cn(
          "container relative",
          aside && "grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.minmax(0,05fr)] lg:items-center"
        )}
      >
        <div className="rise">
          <p className="eyebrow-gold">{eyebrow}</p>
          <h1
            className={cn(
              "mt-3 font-display font-bold leading-[1.06] tracking-tight",
              aside ? "text-4xl sm:text-5xl" : "max-w-3xl text-4xl sm:text-5xl lg:text-6xl"
            )}
          >
            {title}
          </h1>
          {body ? (
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-white/70">
              {body}
            </p>
          ) : null}
          {children ? <div className="mt-9">{children}</div> : null}
        </div>

        {aside ? <div className="rise [animation-delay:120ms]">{aside}</div> : null}
      </div>
    </section>
  );
}
