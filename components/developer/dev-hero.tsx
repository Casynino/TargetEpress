import { PageBanner } from "@/components/app/page-banner";

/**
 * The Developer's banner: the small banner every desk opens on (owner, 8 Nov
 * 2026), with the greeting under the desk's name. The date is in the top bar
 * and what to press lives in the tiles below. English only, like the rest of
 * the console.
 */
export function DevHero({ greeting }: { greeting: string }) {
  return <PageBanner title="Developer" line={greeting} />;
}
