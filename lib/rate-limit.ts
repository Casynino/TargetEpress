import "server-only";

import { headers } from "next/headers";

/**
 * HOW OFTEN ONE ADDRESS MAY ASK FOR SOMETHING EXPENSIVE.
 *
 * Tracking numbers run in sequence, so a script walking them is the obvious
 * thing to slow down — and the invoice download draws a PDF on every request,
 * which is real work for the server rather than a page read from the database.
 *
 * The counts live in this process's memory. On a host running several
 * instances each keeps its own, so the true ceiling is the limit times the
 * instances: this is a floor, not a wall. What makes walking the numbers
 * pointless is the signed key on the link (lib/track-key.ts) and what the
 * public page leaves out; this only makes it slow.
 */
type Bucket = { count: number; resetAt: number };

const store: Map<string, Bucket> =
  ((globalThis as { __teRateLimit?: Map<string, Bucket> }).__teRateLimit ??=
    new Map());

export type Limit = { ok: true } | { ok: false; retryAfterSeconds: number };

export function hit(key: string, max: number, windowMs: number): Limit {
  const now = Date.now();

  /* Swept while writing rather than on a timer, so an idle server holds
     nothing and a busy one never grows past the addresses seen in one
     window. */
  if (store.size > 5_000) {
    for (const [name, bucket] of store) {
      if (bucket.resetAt <= now) store.delete(name);
    }
  }

  const bucket = store.get(key);
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  bucket.count += 1;
  if (bucket.count > max) {
    return {
      ok: false,
      retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000),
    };
  }
  return { ok: true };
}

/**
 * The caller's address, as the proxy in front of us reports it.
 *
 * The first entry of x-forwarded-for. Vercel writes that header itself and
 * throws away whatever the client sent, which is what makes it usable here;
 * a proxy that passed a client's own value through would let a script pick a
 * fresh bucket per request, and is one more reason this is a floor.
 */
export async function clientAddress() {
  const list = await headers();
  const forwarded = list.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || list.get("x-real-ip") || "unknown";
}
