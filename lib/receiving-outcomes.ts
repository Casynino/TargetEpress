import type { ExceptionType } from "@prisma/client";

/**
 * The six answers a Dar clerk can give to one line of the manifest.
 *
 * Receiving used to be a boolean — verified, or flagged with a type picked from
 * a dropdown of eight internal enum names. That asked the clerk to translate
 * what they were looking at ("the box is here but it's full of shoes, not
 * phones") into a schema value, and a translation done eighty-seven times a
 * flight is a translation done badly.
 *
 * So the screen names the six things that actually happen on an arrival floor,
 * and this file is the one place they map onto the exception schema. The clerk
 * says what they see; the system decides what that means.
 *
 * Deliberately separate from ExceptionType. An exception type is every problem
 * this company records anywhere — a weight mismatch found in the office, a
 * wrong-batch discovered a week later. These six are only what a person holding
 * a carton at check-in can report, and keeping the lists apart means widening
 * one never silently widens the other.
 *
 * No "server-only": both the check-in screen and the server action read from
 * here, and they must not be able to drift apart.
 */
export const RECEIVING_OUTCOMES = [
  "RECEIVED",
  "MISSING",
  "DAMAGED",
  "WRONG_ITEM",
  "WRONG_QUANTITY",
  "HOLD",
] as const;

export type ReceivingOutcome = (typeof RECEIVING_OUTCOMES)[number];

export const RECEIVING_OUTCOME_LABELS: Record<ReceivingOutcome, string> = {
  RECEIVED: "Received",
  MISSING: "Missing",
  DAMAGED: "Damaged",
  WRONG_ITEM: "Wrong item",
  WRONG_QUANTITY: "Wrong quantity",
  HOLD: "Hold for investigation",
};

/** One line each, written for somebody standing in front of the cargo. */
export const RECEIVING_OUTCOME_HINTS: Record<ReceivingOutcome, string> = {
  RECEIVED: "Here, complete and undamaged. Goes straight to the pickup counter.",
  MISSING: "Nothing came off the plane for this tracking number.",
  DAMAGED: "It arrived, but broken, crushed, wet or torn open.",
  WRONG_ITEM: "The box is here; what is inside is not what was booked.",
  WRONG_QUANTITY: "Fewer pieces on the floor than the manifest says.",
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
  MISSING: "MISSING_SHIPMENT",
  DAMAGED: "DAMAGED_CARGO",
  WRONG_ITEM: "WRONG_ITEM",
  WRONG_QUANTITY: "PACKAGE_COUNT_MISMATCH",
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
 * Only the short-shipment case. Everything else is a statement about the
 * consignment as a whole, and asking which of five boxes is "wrong item" would
 * be asking a question the floor cannot answer at the door.
 */
export function outcomeNeedsPackageTicker(outcome: ReceivingOutcome) {
  return outcome === "WRONG_QUANTITY";
}
