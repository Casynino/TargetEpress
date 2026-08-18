"use server";

import { searchShipments } from "@/lib/support";
import { authorize } from "@/lib/session";

export type Suggestion = { value: string; label: string; hint?: string };

/**
 * What the cargo search can find, offered while somebody types.
 *
 * The search page looks through every consignment the company has ever carried,
 * so unlike the queues there is no list on screen to filter — the suggestions
 * have to be asked for. It runs the SAME `searchShipments` the results page runs,
 * deliberately: a dropdown built on a second, looser query would offer rows the
 * results then refuse to show, which is a worse experience than no dropdown.
 *
 * Two letters minimum and eight rows out. This fires on a keystroke, and the
 * point is recognition, not a report.
 */
export async function suggestCargo(query: string): Promise<Suggestion[]> {
  try {
    await authorize("shipment.view");
  } catch {
    return [];
  }

  const q = query.trim();
  if (q.length < 2) return [];

  const hits = await searchShipments(q, 8);
  return hits.map((hit) => ({
    /* Searching the tracking number lands on the one consignment; searching a
       name that half the city shares would land on a list. */
    value: hit.trackingNumber,
    label: hit.customer?.name ?? hit.trackingNumber,
    hint: hit.trackingNumber,
  }));
}
