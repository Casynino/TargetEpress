/**
 * Where this site lives, as far as anybody outside the building is concerned.
 *
 * This answer ends up in three places that outlive any deployment: the QR code
 * printed on a cargo label and stuck to a physical box, the canonical URL a
 * search engine records, and the sitemap it reads. None of those may carry a
 * hosting provider's deployment address.
 *
 * It did. Production has NEXT_PUBLIC_SITE_URL set to the vercel.app address,
 * so every label printed since carries a QR that scans to somebody else's
 * domain — and if that deployment name is ever retired, every one of those
 * stickers is a dead scan on a box in a warehouse. The old fallback was worse
 * still: targetexpress.co.tz is the STAFF EMAIL domain and serves no website
 * at all.
 *
 * So the rule is the same one lib/messages.ts applies to a customer's WhatsApp
 * link: anything that is not this company's own address is refused, not used.
 */
export const OFFICIAL_SITE = "https://www.targetexpressaircargo.com";

/** Addresses that belong to a host or a laptop, never to this business. */
const NOT_OURS = /localhost|127\.0\.0\.1|0\.0\.0\.0|\.vercel\.app|\.now\.sh|^https?:\/\/[^/]*:\d+/;

export function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!configured || NOT_OURS.test(configured)) return OFFICIAL_SITE;
  return configured;
}
