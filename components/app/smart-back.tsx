"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { useT } from "@/components/app/locale-provider";
import { labelForPath, previousFrom, readTrail } from "@/lib/nav-trail";
import { cn } from "@/lib/utils";

/**
 * Where back actually goes, for a page that wants to build its own control.
 *
 * A print button, a "‹ All staff" pill, a document action bar — none of them
 * look like the page-header back link and none of them should, but every one
 * of them was a raw `<Link href="/app/fixed/route">` that could not know a
 * trail existed. This is the same resolution `SmartBack` renders, exposed as a
 * value so a page can drop it into whatever markup it already has.
 *
 * Starts at the fallback and corrects once the trail is read, for the same
 * reason `SmartBack` does: the control must not be missing on the server pass
 * or flicker between two destinations mid-press.
 */
export function useSmartBack(fallbackHref: string, fallbackLabel: string) {
  const [target, setTarget] = useState<{ href: string; label: string }>({
    href: fallbackHref,
    label: fallbackLabel,
  });

  useEffect(() => {
    /* Asked against where we actually are, so it cannot matter whether the
       visit has been recorded yet — see previousFrom. */
    const back = previousFrom(readTrail(), window.location.pathname);
    if (!back) return;
    /*
      THE FALLBACK LABEL BELONGS TO THE FALLBACK HREF.

      Callers pass a record's own name — "TX-000165" — as the word for the
      place they know about. labelForPath names lists and returns null for a
      record, so falling through to that name for a DIFFERENT destination put
      one consignment's number on a link to another's page. A neutral word is
      the honest answer when only the page itself knows the name.
    */
    const named = labelForPath(back);
    setTarget({
      href: back,
      label: named ?? (back === fallbackHref ? fallbackLabel : "Back"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fallbackHref, fallbackLabel]);

  return target;
}

/**
 * Back, to where the reader actually came from.
 *
 * The fallback is the page's own relationship — the batch a consignment flew
 * on, the customer a bill belongs to — and it is what shows for somebody who
 * arrived from a notification, a QR scan or a WhatsApp link and walked nowhere.
 * That is the honest answer when there is no journey to unwind.
 *
 * Rendered from the fallback first and corrected once the trail is read, so the
 * control is never missing on the server pass and never flickers between two
 * destinations mid-press.
 */
export function SmartBack({
  fallbackHref,
  fallbackLabel,
  className,
}: {
  fallbackHref: string;
  fallbackLabel: string;
  className?: string;
}) {
  const t = useT();
  const target = useSmartBack(fallbackHref, fallbackLabel);

  return (
    <Link
      href={target.href}
      className={cn(
        /* Desktop only, and 44px tall where it does show: on a phone the shell's
           top bar already carries a back control naming the same place, and two
           stacked one above the other read as a mistake. */
        "focus-ring -ml-1 hidden max-w-full items-center gap-1 rounded-md pl-1 pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground active:bg-accent lg:inline-flex lg:min-h-11",
        "h-11 lg:h-7",
        className
      )}
    >
      <ChevronLeft className="h-4 w-4 shrink-0" />
      <span className="truncate">{t(target.label)}</span>
    </Link>
  );
}
