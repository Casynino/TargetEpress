import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * THE KEY THAT STANDS IN FOR A LOGIN, ON THE LINK WE SENT THE CUSTOMER.
 *
 * Tracking numbers run in sequence: anybody holding TX-000136 knows TX-000137
 * exists. That is why the public tracking page publishes initials rather than
 * the customer's name, and it is the whole reason the invoice — which carries
 * the name, the phone, the city and every charge line — cannot simply be
 * offered to whoever types a number into the box.
 *
 * So the file is offered only to a page opened from our own message. The key
 * is signed over the tracking number with the application secret, travels in
 * the WhatsApp link beside it, and cannot be produced for any other
 * consignment. Without it the page is exactly what it has always been.
 *
 * Nothing is stored. The key is derived, so the same consignment always has
 * the same one — a customer can reopen last month's message and it still
 * works — and the only way to retire every key ever issued is to rotate
 * AUTH_SECRET, which would sign every other token in the app out too.
 */
function secret() {
  const value =
    process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (!value) throw new Error("AUTH_SECRET is not set.");
  return value;
}

/* Sixteen characters of a SHA-256 HMAC. Long enough that guessing one is not
   a thing anybody does, short enough that the link still fits on a phone
   screen as something a customer would tap rather than distrust. */
function sign(trackingNumber: string) {
  return createHmac("sha256", secret())
    .update(`track:${trackingNumber.toUpperCase()}`)
    .digest("base64url")
    .slice(0, 16);
}

export function trackKey(trackingNumber: string) {
  return sign(trackingNumber);
}

/**
 * Does this key belong to this consignment?
 *
 * Compared in constant time. The length check comes first because
 * timingSafeEqual throws on buffers of different sizes, and a caller must
 * never be able to tell "wrong length" from "wrong key" by watching which
 * one errors.
 */
export function trackKeyValid(
  trackingNumber: string,
  key: string | null | undefined
) {
  if (!key || key.length > 64) return false;
  const expected = Buffer.from(sign(trackingNumber));
  const given = Buffer.from(key);
  if (expected.length !== given.length) return false;
  return timingSafeEqual(expected, given);
}
