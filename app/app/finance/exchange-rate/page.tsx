import { redirect } from "next/navigation";

/**
 * The exchange rate is part of pricing, not a page of its own.
 *
 * It is one of the figures the quote engine reads, and it was being set on a
 * screen with no sight of the rate book it multiplies — so a rate could be
 * moved without anybody looking at the prices it applies to. It now sits beside
 * them.
 *
 * Kept as a redirect: the old route is linked from several places and from
 * whatever people have bookmarked.
 */
export default function ExchangeRatePage() {
  redirect("/app/finance/pricing");
}
