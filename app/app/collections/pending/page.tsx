import { redirect } from "next/navigation";

/**
 * Superseded by the follow-up queue.
 *
 * This was a plainer list of unsettled bills. The queue at /app/support/
 * follow-up answers the same question and more: it works out each
 * consignment's next action, runs the storage clock, sends the invoice and
 * records the payment. Two lists of one thing is what this project keeps
 * collapsing, so this one hands over rather than competing.
 */
export default function AwaitingPaymentRedirect() {
  redirect("/app/support/follow-up");
}
