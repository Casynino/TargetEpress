"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { visit } from "@/lib/nav-trail";

/**
 * The one thing that records where the reader has been.
 *
 * Mounted once in the shell, so every page in the app is tracked without a
 * single link having to be changed — and there are about a hundred and eighty
 * links into detail pages here, any of which would otherwise be a screen that
 * still sends people to the wrong place.
 *
 * The search string is deliberately part of what is stored: the tab, the
 * status filter, the page number and the search box are the state somebody was
 * working in, and returning them to the top of a fresh list is the same as
 * losing their place.
 */
export function NavTrail() {
  const pathname = usePathname();
  const search = useSearchParams();

  useEffect(() => {
    /*
      What somebody was LOOKING at, not what they just did.

      The tab, the filter, the page number and the search box are their place
      and are kept. A one-shot instruction is not: `?record=1` opens the Record
      Payment panel on arrival, so storing it meant backing out of a payment
      re-opened the panel the reader had just closed, every time.
    */
    const params = new URLSearchParams(search.toString());
    for (const oneShot of ["record", "note", "verdict", "open", "new"]) {
      params.delete(oneShot);
    }
    const query = params.toString();
    visit(query ? `${pathname}?${query}` : pathname);
  }, [pathname, search]);

  return null;
}
