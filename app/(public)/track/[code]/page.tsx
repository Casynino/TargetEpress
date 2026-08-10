import { redirect } from "next/navigation";
import type { Metadata } from "next";

import { normaliseCode } from "@/lib/format";

/**
 * /track/TX-000042 — the readable form of a tracking link.
 *
 * The one a person can type from memory, read down a phone to a customer, or
 * write on a WhatsApp message. It hands off to the search page rather than
 * rendering a second copy of it: two renderers for one page is how the two
 * start disagreeing about what a held shipment looks like.
 */

export const metadata: Metadata = { title: "Track your cargo" };

export default async function TrackByCodePage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  // Same normalisation the search box applies, so "tx000042", "tx-000042" and
  // "TX-000042" all land on the same cargo.
  const query = normaliseCode(decodeURIComponent(code)) || decodeURIComponent(code);
  redirect(`/track?q=${encodeURIComponent(query)}`);
}
