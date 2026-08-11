import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { t } from "@/lib/i18n";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

/**
 * The old scan screen, now a doorway.
 *
 * Scanning a label used to open a detail page that reported what the cargo was
 * and then offered a button through to the release page, where the counter
 * scanned the same box again. The two permissions involved make that pointless:
 * `shipment.scan` and `shipment.release` are held by exactly the same roles, so
 * nobody was ever shown that page who could not have gone straight to the
 * handover. It cost a navigation with a customer standing there.
 *
 * Kept as a redirect rather than deleted: the code is printed inside test
 * material, sits in bookmarks and browser history, and a warehouse phone that
 * has autocompleted /app/scan for months should still land somewhere useful.
 */
export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Scan a label") };
}

export default async function ScanPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  // Checked before redirecting, so a role without the permission still gets the
  // refusal it would have got here rather than one from another route.
  await requirePermission("shipment.scan");
  const { code } = await searchParams;

  redirect(code ? `/app/release?code=${encodeURIComponent(code)}` : "/app/release");
}
