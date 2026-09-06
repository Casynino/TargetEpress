import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * WHAT WAS CHANGED ON THIS CONSIGNMENT, AND WHY.
 *
 * FieldChange has been written on every cargo edit since editing existed, and
 * rendered nowhere — so the record that answers "who changed the weight, and
 * what was it before" was being kept and never shown. The owner asked for it
 * by name: when we edit, it should show that this was edited in Dar because
 * the kilos did not match.
 *
 * Read here rather than in the page so the check-in screen and the cargo page
 * cannot end up with two shapes of the same fact.
 *
 * WHY is not here yet. A reason against each change needs a column, and a
 * column needs a hand-run migration against Neon before the code that reads it
 * can deploy — which is not a thing to hold a warehouse rename behind. What
 * moved, who moved it and when is most of the answer and needs nothing.
 */
export type FieldEdit = {
  id: string;
  field: string;
  before: string | null;
  after: string | null;
  actorName: string | null;
  at: Date;
};

/** The words the edit screen uses, so the history reads like the form did. */
export const FIELD_LABELS: Record<string, string> = {
  customerName: "Customer",
  customerPhone: "Phone",
  cargoType: "Item",
  description: "Description",
  weightKg: "Weight (kg)",
  packages: "Quantity",
  packageType: "Counted as",
  internalNotes: "Internal note",
};

export async function changeHistory(
  shipmentId: string,
  take = 20
): Promise<FieldEdit[]> {
  const rows = await prisma.fieldChange.findMany({
    where: { entity: "Shipment", entityId: shipmentId },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      field: true,
      before: true,
      after: true,
      actorName: true,
      createdAt: true,
    },
  });
  return rows.map((row) => ({
    id: row.id,
    field: row.field,
    before: row.before,
    after: row.after,
    actorName: row.actorName,
    at: row.createdAt,
  }));
}
