import "server-only";

import { Prisma } from "@prisma/client";

/**
 * One submission, one record — decided by the database, not by a lookup.
 *
 * Every money action guards against a double submission by looking for an
 * identical row written in the last two minutes. That guard reads before it
 * writes, so two genuinely concurrent requests both find nothing and both
 * insert. It was reproduced: two simultaneous calls, two payments, the customer
 * credited twice. The submit button disables while a request is in flight, so a
 * double-click is already stopped; two tabs and a retried request are not.
 *
 * So each form instance generates a key once and sends it with every attempt.
 * The same instance submitted twice collides on a unique index, which is the one
 * check that cannot be raced because Postgres serialises it.
 *
 * A genuine second payment is a different form instance with a different key,
 * and is never refused.
 */

/** The key off a form, or null when it carries none (an older client). */
export function idempotencyKeyFrom(formData: FormData): string | null {
  const raw = formData.get("idempotencyKey");
  if (typeof raw !== "string") return null;
  const key = raw.trim();
  /* Length-bounded rather than format-checked: it only has to be unique and
     unguessable, and refusing a client's key on shape would turn a working
     payment into an error message. */
  return key.length >= 8 && key.length <= 100 ? key : null;
}

/**
 * Whether a thrown error is the unique index refusing a repeat submission.
 *
 * Narrowed to the idempotency index specifically. Every other P2002 in a money
 * action is a different fault and must not be reported to the desk as "already
 * recorded" — that would hide a real problem behind a reassuring sentence.
 */
export function isRepeatSubmission(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (error.code !== "P2002") return false;
  const target = error.meta?.target;
  const fields = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return fields.includes("idempotencyKey");
}
