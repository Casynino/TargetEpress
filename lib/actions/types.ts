export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

export function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

/** Turns a thrown error into a message safe to render in a form. */
export function toActionError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}
