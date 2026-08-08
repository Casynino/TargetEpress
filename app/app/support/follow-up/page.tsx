import { redirect } from "next/navigation";

/**
 * The chase list moved to /app/collections/follow-up.
 *
 * Kept as a redirect rather than deleted: this URL has been in the support
 * sidebar for months, so it is in people's history and in at least one WhatsApp
 * thread. A 404 for a page that still exists under a different name is a
 * support call, and the cost of avoiding it is four lines.
 */
export default function LegacyFollowUpRedirect() {
  redirect("/app/collections/follow-up");
}
