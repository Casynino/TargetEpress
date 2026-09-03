"use client";

import { useCallback, useState } from "react";

/**
 * A key this form instance carries on every attempt.
 *
 * Two concurrent submissions of the same form both pass the action's own
 * duplicate check — it reads before it writes — and both create a payment. That
 * was reproduced. The key collides on a unique index instead, which is the one
 * check that cannot be raced. See lib/idempotency.ts.
 *
 * Generated once per mount and held in state, so every retry of the SAME
 * attempt carries the SAME key: a slow request the customer resubmits, a second
 * tab, a form restored after a back button. `reset` is called after a success,
 * because the next payment is a genuinely different one and must not be refused
 * as a repeat of the last.
 */
export function useIdempotencyKey() {
  const [key, setKey] = useState(newKey);
  const reset = useCallback(() => setKey(newKey()), []);
  return { key, reset };
}

function newKey() {
  /* randomUUID needs a secure context, which a phone on the office wifi over
     plain http is not — and a payment must not fail because of where it was
     taken from. */
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** The hidden field itself, so a form adds one line rather than three. */
export function IdempotencyKey({ value }: { value: string }) {
  return <input type="hidden" name="idempotencyKey" value={value} />;
}
