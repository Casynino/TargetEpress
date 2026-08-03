import { redirect } from "next/navigation";

/**
 * Verification was folded into Incoming Shipments.
 *
 * It listed ARRIVED batches awaiting sign-off — a subset of the rows Incoming
 * Shipments already shows on the floor, with the same batch, the same line
 * count and a differently-worded button. Landing a flight and checking its
 * shipments off are two moments in one job at one desk, so they belong on one
 * page; the per-batch check-off screen it linked to still lives at
 * /app/receive/[id].
 *
 * The route stays so existing links do not 404.
 */
export default function VerificationPage() {
  redirect("/app/receive");
}
