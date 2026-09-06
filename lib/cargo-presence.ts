import type { ExceptionType } from "@prisma/client";

/**
 * Does this kind of problem mean the cargo is standing in the Dar warehouse?
 *
 * A damaged carton is still a carton on the floor. Somebody has to store it,
 * find it again, and answer the customer asking where it is — and none of that
 * is possible if flagging the damage is what keeps it out of the system. The
 * old code refused to receive anything flagged, so a torn box sat on a shelf in
 * Dar while the record said it was in the air: invisible to Warehouse
 * Inventory, invisible to the counter, and invisible on the customer's
 * tracking. That is exactly how a box goes missing while nobody has moved it.
 *
 * So the flag no longer decides whether the cargo enters the warehouse. Only
 * this table does, and it answers one physical question: did anything arrive?
 * MISSING_SHIPMENT is the single case where the answer is no.
 *
 * Written as an exhaustive Record on purpose. Add an ExceptionType to the
 * schema and this file stops compiling until somebody says where that cargo
 * physically is. The answer is not guessable and the cost of guessing it wrong
 * is a lost carton.
 */
export const CARGO_PHYSICALLY_HERE: Record<ExceptionType, boolean> = {
  // Nothing came off the plane. There is no cargo to receive.
  MISSING_SHIPMENT: false,
  // All of these arrived. They arrived wrong, which is a different problem.
  DAMAGED_CARGO: true,
  WEIGHT_MISMATCH: true,
  PACKAGE_COUNT_MISMATCH: true,
  WRONG_BATCH: true,
  // The box is on the floor; its contents are not what was booked. Refusing to
  // receive it would leave a real carton the warehouse is holding invisible to
  // Inventory — the exact failure this table was written to stop.
  WRONG_ITEM: true,
  // Left in China for weight. Nothing came off this plane either — what
  // separates it from MISSING_SHIPMENT is the sentence the customer is told,
  // not anything on the warehouse floor.
  SHORT_LANDED: false,
  // In Dar, and not ours to touch. It is honestly not in the warehouse, and
  // saying otherwise would put it in front of the release counter.
  HELD_BY_CUSTOMS: false,
  // A box with no readable marking is still a box on the floor, and pretending
  // otherwise loses a real carton the warehouse is holding.
  UNIDENTIFIED_CARGO: true,
  // It flew and it landed. Whether it may be handed over is the case.
  RESTRICTED_ITEM: true,
  // More arrived than was booked, so what arrived is certainly here.
  OVER_SHIPPED: true,
  // A quarantine, and you cannot quarantine something you do not have. It is
  // received, and the open case is what keeps it off the pickup counter.
  HOLD_FOR_INVESTIGATION: true,
  OTHER: true,
};

/**
 * THE SAME FACT, IN WORDS A PERSON READS.
 *
 * A damaged carton standing in Kariakoo and a carton nobody can find both
 * showed as "Under investigation", and that one phrase is the difference
 * between "come and collect it, it is dented" and "we are searching". The
 * owner asked for the two to stop looking alike.
 *
 * Derived, never stored. Adding a ShipmentStatus for it would put damaged
 * cargo outside twelve separate floor whitelists — one of which is what tells
 * the warehouse what it is holding — and would need a hand-run migration
 * against Neon before the code could deploy. The fact is already recorded, by
 * the table above; this only says it out loud.
 *
 * NOT FOR THE CUSTOMER. The public tracking page deliberately never names a
 * fault — see lib/tracking-investigation.ts — and nothing here changes that.
 * This is for the desks that have to find the box.
 */
export function cargoIsHere(type: ExceptionType): boolean {
  return CARGO_PHYSICALLY_HERE[type];
}

/**
 * The English key for that fact, ready for t().
 *
 * Deliberately two states and no third. PACKAGE_COUNT_MISMATCH is genuinely
 * both — four boxes on the floor and a fifth nobody can find — and it answers
 * "here", because the question this label exists to settle is whether somebody
 * should be searching or collecting, and four cartons are collectable. The
 * count figures beside it say the rest.
 */
export function presenceLabel(type: ExceptionType): string {
  return CARGO_PHYSICALLY_HERE[type] ? "Cargo present" : "Not in the warehouse";
}
