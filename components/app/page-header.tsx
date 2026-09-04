import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { t } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { SmartBack } from "@/components/app/smart-back";
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
/*
  Only a shape now. The fixed-href BackLink that used to live beside it is gone:
  every caller has become SmartBack or BackLinkButton, both of which read the
  trail, and leaving a hardcoded one exported was an invitation for the next
  detail page to point back at a record's relationship instead of the list the
  reader was working in — which is exactly what the invoice page did.
*/
export type BackTo = {
  href: string;
  label: string;
  /** Show on phones too. Default true; false when the shell already says this. */
  mobile?: boolean;
};

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
        {/* The trail decides where back goes; what the page passed is the
            fallback for somebody who arrived from a link and walked nowhere.
            See lib/nav-trail.ts — relationship is not navigation. */}
        {backTo ? (
          <SmartBack
            fallbackHref={backTo.href}
            fallbackLabel={backTo.label}
            className="mb-0.5"
          />
        ) : null}
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
