import { redirect } from "next/navigation";

/**
 * Collections opens on the work, not on a picture of the work.
 *
 * There used to be a dashboard here: four cards, an attention panel and two
 * lists, in front of the call list somebody actually came to use. The owner's
 * objection was the right one — it was a page you read before reaching the page
 * you work, and everything on it was either already on the call list or worth
 * one small figure at the top of it.
 *
 * So this route is the call list. The figures it carried are folded into the
 * strip there, and the tab that pointed at this page is gone. It stays as a
 * redirect rather than moving the list's file, because thirty-one links across
 * the app already point at the queue by its own address and a rename would
 * break every one of them to save a word in the URL.
 */
export default function CollectionsPage() {
  redirect("/app/collections/follow-up");
}
