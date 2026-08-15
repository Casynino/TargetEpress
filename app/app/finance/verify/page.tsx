import { redirect } from "next/navigation";

/**
 * Verifying payments lives in Collections, and only there.
 *
 * This page and /app/collections/verify rendered the same VerifyQueue with a
 * different row of tabs above it, so the same job appeared twice in the app
 * and each copy threw the reader into the other's navigation. The owner's
 * instruction was plain: it belongs inside Collections.
 *
 * A redirect rather than a deletion, because the dashboard shortcut, the
 * attention list and a permission-mapped route prefix all point here. They
 * keep working and they land on the one page that does the work.
 */
export default function VerifyPaymentsPage() {
  redirect("/app/collections/verify");
}
