import type { ShipmentStatus } from "@prisma/client";

/**
 * WHEN CARGO BECOMES MONEY.
 *
 * The owner's rule, in one place:
 *
 *   No Dar confirmation = no final price = no payment = no Merge Payment.
 *
 * A consignment is quoted in China from a packing list. What it actually
 * weighs, and how many pieces actually arrived, is known only when the Dar
 * floor checks it off the manifest — which is why autoPriceShipments runs
 * there and nowhere else. A price shown before that is a guess, and a customer
 * who pays a guess has to be argued with afterwards when the real weight turns
 * out different.
 *
 * The check was written into generateInvoice alone. Every other way money
 * could be taken — the counter form, the Support claim, the merge screen, the
 * credit release, the combined bill — asked only what the INVOICE said, so a
 * flight still in the air was payable through all of them. This is that same
 * test, named once, so the answer cannot differ between two screens.
 */

/**
 * Dar has the cargo and has confirmed it.
 *
 * RECEIVED_AT_DAR is the check-in itself; the two after it are states a
 * consignment can only reach by passing through it. This is exactly the set
 * generateInvoice has always refused to bill outside of.
 */
export const DAR_CONFIRMED: readonly ShipmentStatus[] = [
  "RECEIVED_AT_DAR",
  "READY_FOR_PICKUP",
  "DELIVERED",
];

/**
 * Cargo whose bill may still be SETTLED, though no new one may be raised.
 *
 * A box that landed, was priced, was billed and has since been reported
 * missing is under investigation — and the debt on it is real, raised while
 * the cargo was on the floor. Refusing the payment would leave a customer who
 * wants to pay unable to, and would drop a genuine receivable off the call
 * list, so settlement stays open while pricing does not.
 */
export const STILL_COLLECTABLE: readonly ShipmentStatus[] = [
  ...DAR_CONFIRMED,
  "UNDER_INVESTIGATION",
];

/** Has the Dar floor confirmed this cargo? The answer to "may it be priced". */
export function isDarConfirmed(status: ShipmentStatus | null | undefined) {
  return status != null && DAR_CONFIRMED.includes(status);
}

/** May money be taken against this cargo's bill? */
export function isCollectable(status: ShipmentStatus | null | undefined) {
  return status != null && STILL_COLLECTABLE.includes(status);
}

/**
 * The refusal, in the words the desk needs.
 *
 * It says what is wrong, and what makes it right — the warehouse checking the
 * boxes off the manifest — rather than only that the action was refused. The
 * tracking number is in it because these actions run over several bills at
 * once and "one of them has not landed" is not an answer anybody can act on.
 */
export function notPayableMessage(trackingNumber: string) {
  return (
    `${trackingNumber} has not been checked in at Dar yet, so there is no ` +
    `final price on it and it cannot be paid for. It becomes payable the ` +
    `moment the warehouse checks it off the manifest.`
  );
}

/** Prisma `where` for the shipment behind a bill somebody may pay. */
export const COLLECTABLE_SHIPMENT_WHERE = {
  status: { in: [...STILL_COLLECTABLE] as ShipmentStatus[] },
};

/** Prisma `where` for cargo Dar has confirmed and may therefore be priced. */
export const DAR_CONFIRMED_SHIPMENT_WHERE = {
  status: { in: [...DAR_CONFIRMED] as ShipmentStatus[] },
};
