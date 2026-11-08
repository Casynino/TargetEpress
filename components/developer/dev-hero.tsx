import { PageBanner, bannerDate } from "@/components/app/page-banner";

/**
 * The Developer's banner: the small banner every desk opens on (owner, 8 Nov
 * 2026), with the date under the desk's name and the bell at its side. What
 * to press lives in the tiles below. English only, like the rest of the
 * console.
 */
export function DevHero() {
  return <PageBanner title="Developer" line={bannerDate("en")} />;
}
