import { EMBLEM_GLOBE, EMBLEM_JET, EMBLEM_VIEWBOX } from "@/components/brand-paths";
import { cn } from "@/lib/utils";

/**
 * Target Express — the real emblem, not a drawing of it.
 *
 * This was a redraw for a while: a wireframe globe with a paper-dart aeroplane,
 * which was honest about being a stand-in and still wrong, because a company's
 * mark is not a thing to approximate. It is now the registered artwork itself,
 * traced to vector so it can be painted with tokens instead of baked pixels.
 *
 * Tokens matter here. The original is navy ink on transparency, and navy on the
 * navy sidebar is a hole in the page — this mark spends most of its life on
 * dark. text-brand is the logo's own navy on a light page and a legible blue on
 * a dark one, so the same file works in both without two artworks to keep in
 * step. The land is not painted at all: even-odd fill leaves the continents as
 * holes, so they take the colour of whatever is behind them.
 *
 * The mark is wider than it is tall — the aircraft leaves the globe on the
 * right. Size it by height (h-9 w-auto); a square box would squash it.
 */
export function BrandMark({
  className,
  style,
  tone = "theme",
}: {
  className?: string;
  /** For print, where the mark is sized in millimetres rather than in rems. */
  style?: React.CSSProperties;
  /**
   * "theme" follows the tokens, which is what the app chrome needs.
   *
   * "paper" pins the mark to the artwork's own inks. Printed documents are
   * white in either theme, so a token that brightens for the dark sidebar would
   * put pale blue on a page somebody is about to photocopy.
   */
  tone?: "theme" | "paper";
}) {
  const globe = tone === "paper" ? "fill-[#182A48]" : "fill-brand";
  const jet = tone === "paper" ? "fill-[#D81E2A]" : "fill-signal";

  return (
    <svg
      viewBox={EMBLEM_VIEWBOX}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-9 w-auto", className)}
      style={style}
      aria-hidden="true"
    >
      <path d={EMBLEM_GLOBE} fillRule="evenodd" className={globe} />
      <path d={EMBLEM_JET} fillRule="evenodd" className={jet} />
    </svg>
  );
}

/**
 * The mark with the name set beside it.
 *
 * Not the full artwork. In the real lockup "Express Air Cargo" is a third the
 * height of "Target", and in a 64px sidebar header that lands at about four
 * pixels of letter — present, unreadable, and the kind of detail that makes a
 * product look like a scan of a business card. So the emblem is the artwork and
 * the name is type, at a size a person can actually read.
 *
 * Colours follow the registered mark: Target in red, Express Air Cargo in navy.
 * They were the other way round until the artwork was checked against.
 */
export function BrandLockup({
  className,
  subtitle = true,
}: {
  className?: string;
  subtitle?: boolean;
}) {
  return (
    // gap-2, not gap-2.5: the aircraft leaves the emblem at the top right, so
    // the box is empty beside the words and already reads as a wider gap than
    // it measures.
    <span className={cn("flex items-center gap-2", className)}>
      <BrandMark className="h-8 w-auto shrink-0" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[16px] font-extrabold tracking-tight text-signal">
          Target
        </span>
        {subtitle ? (
          /*
            Left in English on a Chinese screen, deliberately.

            This line is not a description of the service, it is the second
            half of the registered wordmark — the company is called Target
            Express Air Cargo, it is what the artwork says, and it is what is
            printed on the invoices and pickup notes customers already hold.
            Setting it as 空运快递 in the sidebar would make the app's logo and
            the company's paperwork disagree, which is worse than a Guangzhou
            clerk reading three familiar English words under a mark they see
            on every carton. Translate the interface; leave the name.
          */
          <span className="mt-1 text-xs font-bold uppercase tracking-[0.12em] text-brand">
            Express Air Cargo
          </span>
        ) : null}
      </span>
    </span>
  );
}

/**
 * The full registered lockup, in its own colours.
 *
 * For the documents that leave the building — an invoice, a pickup note, a
 * manifest. Those print on white, so the navy needs no token and the artwork
 * can be used exactly as it is. Served as a file rather than inlined: it is
 * thirteen kilobytes of path data that three print routes need and no screen
 * does, and it should not ride along in everybody's bundle.
 */
export function BrandLogo({ className }: { className?: string }) {
  return (
    // A plain img on purpose: next/image refuses SVG without
    // dangerouslyAllowSVG, and there is nothing here for it to optimise.
    <img
      src="/brand/target-express-logo.svg"
      alt="Target Express Air Cargo"
      className={cn("h-12 w-auto", className)}
    />
  );
}
