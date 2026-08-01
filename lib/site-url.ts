/**
 * Where this site lives.
 *
 * Read from the environment so a preview deployment does not publish canonical
 * URLs pointing at production. Falls back to the real domain rather than
 * localhost: a sitemap full of localhost links is worse than a slightly stale
 * one, and it is the failure nobody notices until the site has been live a
 * month.
 */
export function siteUrl() {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);

  return (configured ?? "https://targetexpress.co.tz").replace(/\/$/, "");
}
