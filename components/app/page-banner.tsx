import Image from "next/image";

import { cn } from "@/lib/utils";

/* The aircraft the public site opens on — the brand's own picture, already
   allowed in next.config. It stands where Super Drive shows its products. */
const PHOTO =
  "https://images.unsplash.com/photo-1515780855147-aee414989c82?auto=format&fit=crop&w=900&q=70";

/**
 * THE SMALL BANNER every desk opens on (owner, 8 Nov 2026).
 *
 * Copied from Super Drive's point-of-sale banner: deep navy, a blue glow on
 * the right and a little gold light from the top, the desk's name in wide
 * letters between two gold rules, "TARGET EXPRESS" in gold under it, and one
 * short line. The aircraft sits at the side on a wide screen. The banners
 * before it carried a greeting, two clocks, a search box and buttons; the
 * owner asked for them small and clean, so the clocks went to the top bar and
 * each desk's search box and button sit just under the banner instead.
 *
 * Text comes in already translated: the Developer console is English only and
 * passes plain strings.
 */
export function PageBanner({
  title,
  line,
  extra,
  kicker = "Target Express",
}: {
  /** The desk's name, drawn in wide capitals. */
  title: string;
  /** One short line under the gold name — usually the greeting. */
  line?: React.ReactNode;
  /** A second, smaller line, for the one desk whose banner carries figures. */
  extra?: React.ReactNode;
  /** The gold line. The company's name, left in English like the wordmark. */
  kicker?: string;
}) {
  // A long name gets narrower letters, or a phone would push it onto two lines.
  const long = title.length > 10;

  return (
    <section className="relative mb-4 overflow-hidden rounded-2xl bg-[#0a1a33] text-white shadow-[0_10px_30px_-14px_rgba(5,22,39,0.7)] ring-1 ring-white/10 print:hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_220px_at_88%_55%,rgba(47,111,208,0.42),transparent_62%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(520px_170px_at_50%_0%,rgba(253,196,0,0.10),transparent_72%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-[30%] [mask-image:linear-gradient(to_left,#000_40%,transparent)] lg:block"
      >
        <Image src={PHOTO} alt="" fill sizes="30vw" className="object-cover opacity-75" />
      </div>

      <div className="relative flex min-h-[7.5rem] flex-col items-center justify-center px-5 py-5 text-center">
        <h1
          className={cn(
            "flex max-w-full items-center gap-4 font-semibold uppercase text-white",
            long
              ? "text-lg tracking-[0.22em] sm:text-2xl sm:tracking-[0.3em] lg:text-3xl"
              : "text-2xl tracking-[0.35em] sm:text-3xl sm:tracking-[0.5em] lg:text-4xl",
          )}
        >
          <span aria-hidden className="hidden h-px w-10 shrink-0 bg-[#fdc400]/60 sm:block" />
          {/* The padding gives back the space the wide tracking leaves after
              the last letter, so the word sits truly in the middle. */}
          <span className={cn("min-w-0 break-words", long ? "pl-[0.22em] sm:pl-[0.3em]" : "pl-[0.35em] sm:pl-[0.5em]")}>
            {title}
          </span>
          <span aria-hidden className="hidden h-px w-10 shrink-0 bg-[#fdc400]/60 sm:block" />
        </h1>
        <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-[#fdc400]">{kicker}</p>
        {line ? <p className="mt-1.5 text-sm text-white/65">{line}</p> : null}
        {extra ? <p className="mt-1 text-xs leading-relaxed text-white/55 sm:text-[13px]">{extra}</p> : null}
      </div>
    </section>
  );
}
