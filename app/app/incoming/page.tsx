import { redirect } from "next/navigation";

/**
 * Incoming Shipments was folded into Receive Cargo.
 *
 * It listed IN_TRANSIT and ARRIVED batches read-only; Receive Cargo lists the
 * same set and carries the "Mark as arrived" action. Two pages showing the same
 * rows means the desk has to decide which one to trust, and the one without the
 * button is always the wrong answer.
 *
 * The route stays so old links, bookmarks and the notification emails that
 * point at it still land somewhere useful.
 */
export default function IncomingPage() {
  redirect("/app/receive");
}
