import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/site-url";

/**
 * What crawlers may look at.
 *
 * The staff application and the auth routes are closed. So is any tracking
 * page carrying a query — a crawler following one indexed tracking link would
 * happily walk the whole sequence of tracking numbers, which is exactly the
 * enumeration the tracking page is written to survive but need not invite.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app/", "/api/", "/login", "/track?"],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}
