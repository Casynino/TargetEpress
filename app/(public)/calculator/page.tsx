import { redirect } from "next/navigation";

/**
 * The public calculator is gone.
 *
 * It priced hypothetical cargo, which is the rate book published one line at a
 * time — enter one kilogram and you have the per-kilo rate. Since the price
 * list itself is no longer public, leaving the calculator would have been a
 * side door to the same information.
 *
 * The route stays so that older links, WhatsApp messages and search results
 * land somewhere useful rather than on a 404.
 */
export default function CalculatorPage() {
  redirect("/pricing");
}
