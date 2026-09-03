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
    const query = search.toString();
    visit(query ? `${pathname}?${query}` : pathname);
  }, [pathname, search]);

  return null;
}
