import type { MetadataRoute } from "next";

import { ARTICLES } from "@/lib/learn";
import { siteUrl } from "@/lib/site-url";

/**
 * The public map of the site.
 *
 * Only pages a stranger should land on. Everything under /app is staff-only
 * and everything under /track?q= is one customer's cargo — neither belongs in
 * an index, and listing them would invite crawlers to enumerate them.
 *
 * Priorities are relative, not absolute: booking and tracking are what the
 * business needs found, the guides are what brings strangers in, and the rest
 * supports both.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl();
  const now = new Date();

  const pages: { path: string; priority: number; frequency: MetadataRoute.Sitemap[number]["changeFrequency"] }[] = [
    { path: "", priority: 1, frequency: "weekly" },
    { path: "/book", priority: 0.9, frequency: "monthly" },
    { path: "/track", priority: 0.9, frequency: "daily" },
    { path: "/pickup", priority: 0.8, frequency: "monthly" },
    // Regenerated from today's date, so it is genuinely different every week.
    { path: "/schedule", priority: 0.8, frequency: "daily" },
    { path: "/pricing", priority: 0.8, frequency: "weekly" },
    { path: "/china", priority: 0.7, frequency: "monthly" },
    { path: "/china/markets", priority: 0.7, frequency: "monthly" },
    { path: "/services", priority: 0.7, frequency: "monthly" },
    { path: "/services/sourcing", priority: 0.7, frequency: "monthly" },
    { path: "/warehouses", priority: 0.6, frequency: "monthly" },
    { path: "/learn", priority: 0.7, frequency: "monthly" },
    { path: "/contact", priority: 0.6, frequency: "monthly" },
  ];

  return [
    ...pages.map((page) => ({
      url: `${base}${page.path}`,
      lastModified: now,
      changeFrequency: page.frequency,
      priority: page.priority,
    })),
    ...ARTICLES.map((article) => ({
      url: `${base}/learn/${article.slug}`,
      lastModified: now,
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
