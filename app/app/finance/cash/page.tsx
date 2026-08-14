import { redirect } from "next/navigation";

/**
 * The tin moved into Accounts, so this door leads there.
 *
 * Kept rather than deleted: the route has been linked from the overview, from
 * the sidebar and from anybody's bookmarks since the day it shipped, and a
 * 404 is a worse answer than the page they actually wanted.
 */
export default function CashPage() {
  redirect("/app/finance/accounts");
}
