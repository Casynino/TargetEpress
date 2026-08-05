import { redirect } from "next/navigation";

/**
 * The rate book moved into the Finance portal.
 *
 * It used to be a CEO-only page under Management, on the reasoning that what
 * the business charges is the owner's decision. The owner has since put pricing
 * where the desk that uses it works: a price change is a Finance job, and the
 * point of that page is that it never needs a developer or a CEO to make one.
 *
 * Kept as a redirect because saved links and bookmarks still point here.
 */
export default function AdminPricingPage() {
  redirect("/app/finance/pricing");
}
