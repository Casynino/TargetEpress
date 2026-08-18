import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { viewerLocale } from "@/lib/viewer";

/**
 * Where this page came from, named.
 *
 * The shell's own back control (components/app/mobile-back) can only guess a
 * parent from the URL, so from a consignment it says "Arrived batches" — true,
 * but it cannot say WHICH flight the box was on. This one is told, so a detail
 * page can point at the exact record above it.
 *
 * `mobile: false` is for the labels that would say nothing new. On a phone the
 * shell's control is pinned in a sticky top bar, so a page-level "← Customers"
 * sixteen pixels under a top-bar "← Customers" is the same words twice and a
 * wasted row in an app whose owner keeps rejecting tall headers. Those hide
 * below `lg` and stay as the desktop convenience they are; the ones that name
 * a specific record earn their place on both.
 */
export type BackTo = {
  href: string;
  label: string;
  /** Show on phones too. Default true; false when the shell already says this. */
  mobile?: boolean;
};

export async function BackLink({
  href,
  label,
  mobile = true,
  className,
}: BackTo & { className?: string }) {
  const locale = await viewerLocale();
  return (
    <Link
      href={href}
      className={cn(
        /*
          Desktop only, and 44px tall where it does show.

          On a phone the shell's top bar already carries a back control naming
          the same parent, and two "← Arrived batches" stacked one above the
          other is not twice as helpful — it reads as a mistake. Desktop has no
          such bar, so this is the only named way up there and it earns its
          place. `min-h-11` is kept anyway for the tablet width where it appears
          and a finger is still what presses it.
        */
        "focus-ring -ml-1 hidden max-w-full items-center gap-1 rounded-md pl-1 pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground active:bg-accent lg:inline-flex lg:min-h-11",
        /* 44px where a thumb has to find it while the other hand holds a box;
           a normal text line on a desktop, where it sits beside a sidebar that
           already shows the section and must not shout. */
        "h-11 lg:h-7",
        mobile ? "" : "hidden lg:inline-flex",
        className
      )}
    >
      <ChevronLeft className="h-4 w-4 shrink-0" />
      {/* Truncates rather than wrapping. Labels here are record names, and a
          long one — a customer, a batch with a suffix — would otherwise take a
          second line of a header the owner already wants shorter, or on the
          invoice toolbar push the print and download buttons off the row. */}
      <span className="truncate">{t(locale, label)}</span>
    </Link>
  );
}

/**
 * The title bar on every screen, in the reader's language.
 *
 * Async and resolving the locale itself rather than taking it as a prop:
 * fifty-eight pages render this, and threading a locale through every one of
 * them would be fifty-eight chances to forget. A server component can just ask.
 */
export async function PageHeader({
  title,
  description,
  actions,
  backTo,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  /** Optional, so the fifty-odd pages that never pass it cannot break. */
  backTo?: BackTo;
  className?: string;
}) {
  const locale = await viewerLocale();
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        {backTo ? <BackLink {...backTo} className="mb-0.5" /> : null}
        <h1 className="font-display text-2xl font-bold tracking-tight">
          {t(locale, title)}
        </h1>
        {description ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {t(locale, description)}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
