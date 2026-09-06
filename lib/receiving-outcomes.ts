import type { ExceptionType } from "@prisma/client";

/**
 * The answers a Dar clerk can give to one line of the manifest.
 *
 * Receiving used to be a boolean — verified, or flagged with a type picked from
 * a dropdown of eight internal enum names. That asked the clerk to translate
 * what they were looking at ("the box is here but it's full of shoes, not
 * phones") into a schema value, and a translation done eighty-seven times a
 * flight is a translation done badly.
 *
 * So the screen names the things that actually happen on an arrival floor,
 * and this file is the one place they map onto the exception schema. The clerk
 * says what they see; the system decides what that means.
 *
 * Deliberately separate from ExceptionType. An exception type is every problem
 * this company records anywhere — a weight mismatch found in the office, a
 * wrong-batch discovered a week later. These are only what a person holding a
 * carton at check-in can report, and keeping the lists apart means widening one
 * never silently widens the other.
 *
 * ORDERED THE WAY THE FLOOR MEETS THEM. Everything arrived, then the ordinary
 * faults, then the ones where the cargo is not in the building, then the two
 * that stop the box at the counter for a reason of their own. A clerk scanning
 * this list is choosing under time pressure with a carton in their hands.
 *
 * No "server-only": both the check-in screen and the server action read from
 * here, and they must not be able to drift apart.
 */
export const RECEIVING_OUTCOMES = [
  "RECEIVED",
  "DAMAGED",
  "WRONG_ITEM",
  "WRONG_QUANTITY",
  "OVER_QUANTITY",
  "MISSING",
  "SHORT_LANDED",
  "AT_CUSTOMS",
  "NO_LABEL",
  "RESTRICTED",
  "HOLD",
] as const;

export type ReceivingOutcome = (typeof RECEIVING_OUTCOMES)[number];

export const RECEIVING_OUTCOME_LABELS: Record<ReceivingOutcome, string> = {
  RECEIVED: "Received",
  DAMAGED: "Damaged",
  WRONG_ITEM: "Wrong item",
  WRONG_QUANTITY: "Fewer boxes",
  OVER_QUANTITY: "More boxes",
  MISSING: "Missing",
  SHORT_LANDED: "Left in China",
  AT_CUSTOMS: "Held by customs",
  NO_LABEL: "No label",
  RESTRICTED: "Restricted item",
  HOLD: "Hold for investigation",
};

/** One line each, written for somebody standing in front of the cargo. */
export const RECEIVING_OUTCOME_HINTS: Record<ReceivingOutcome, string> = {
  RECEIVED: "Here, complete and undamaged. Goes straight to the pickup counter.",
  DAMAGED: "It arrived, but broken, crushed, wet or torn open.",
  WRONG_ITEM: "The box is here; what is inside is not what was booked.",
  WRONG_QUANTITY: "Fewer pieces on the floor than the manifest says.",
  OVER_QUANTITY:
    "More pieces than the manifest says. One of them is usually somebody else's.",
  MISSING: "Nothing came off the plane and nobody knows where it is.",
  SHORT_LANDED:
    "Left behind in China for weight. Not lost — it comes on the next flight.",
  AT_CUSTOMS: "It landed, but customs is holding it. Not ours to release yet.",
  NO_LABEL: "A box with no readable marking. We think it is theirs, not sure.",
  RESTRICTED:
    "Something aboard that should not have flown — a battery, a liquid, an aerosol.",
  HOLD: "Something is not right and you cannot yet say what. Quarantine it.",
};

/**
 * What each outcome means to the investigation queue.
 *
 * `null` is the only value that lets cargo reach the pickup counter. Every
 * other outcome opens a case, and an open case is what keeps a customer from
 * ever being told "Ready for Pickup" about a box nobody can find.
 *
 * An exhaustive Record on purpose: add a seventh outcome and this file stops
 * compiling until somebody says which kind of case it raises.
 */
export const RECEIVING_OUTCOME_EXCEPTION: Record<
  ReceivingOutcome,
  ExceptionType | null
> = {
  RECEIVED: null,
  DAMAGED: "DAMAGED_CARGO",
  WRONG_ITEM: "WRONG_ITEM",
  WRONG_QUANTITY: "PACKAGE_COUNT_MISMATCH",
  OVER_QUANTITY: "OVER_SHIPPED",
  MISSING: "MISSING_SHIPMENT",
  SHORT_LANDED: "SHORT_LANDED",
  AT_CUSTOMS: "HELD_BY_CUSTOMS",
  NO_LABEL: "UNIDENTIFIED_CARGO",
  RESTRICTED: "RESTRICTED_ITEM",
  HOLD: "HOLD_FOR_INVESTIGATION",
};

export function isReceivingOutcome(value: string): value is ReceivingOutcome {
  return (RECEIVING_OUTCOMES as readonly string[]).includes(value);
}

/**
 * Does this outcome need a sentence from the clerk?
 *
 * Anything that opens a case does. Somebody will read that case cold, weeks
 * later, with the cargo long gone — "DAMAGED_CARGO" on its own tells them
 * nothing they can act on.
 */
export function outcomeNeedsNote(outcome: ReceivingOutcome) {
  return RECEIVING_OUTCOME_EXCEPTION[outcome] !== null;
}

/**
 * Does this outcome want the per-box ticker?
 *
 * Only where the count itself is the answer, and only where ticking boxes says
 * something true. Everything else is a statement about the consignment as a
 * whole, and asking which of five boxes is "wrong item" would be asking a
 * question the floor cannot answer at the door.
 *
 * Not OVER_QUANTITY, deliberately: the ticker exists to say WHICH of the booked
 * boxes turned up, and the whole point of that case is a carton that is on no
 * manifest line to tick. How many extra, and what they look like, goes in the
 * note — which this outcome requires like every other case does.
 *
 * Written as an exhaustive Record rather than an equality test: this was
 * `outcome === "WRONG_QUANTITY"`, so a new outcome silently answered "no"
 * instead of failing to build, which is the one thing this file exists to stop.
 */
const OUTCOME_TICKS_BOXES: Record<ReceivingOutcome, boolean> = {
  WRONG_QUANTITY: true,
  RECEIVED: false,
  DAMAGED: false,
  WRONG_ITEM: false,
  OVER_QUANTITY: false,
  MISSING: false,
  SHORT_LANDED: false,
  AT_CUSTOMS: false,
  NO_LABEL: false,
  RESTRICTED: false,
  HOLD: false,
};

export function outcomeNeedsPackageTicker(outcome: ReceivingOutcome) {
  return OUTCOME_TICKS_BOXES[outcome];
}
