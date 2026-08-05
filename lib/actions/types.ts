export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

export function ok<T>(data?: T): ActionResult<T> {
  return { ok: true, data };
}

/**
 * Turns a thrown error into a message safe to render in a form.
 *
 * Prisma's own errors are caught by code rather than let through: their text
 * names tables and columns, which is both meaningless to a clerk at a counter
 * and more than they should be shown. Every one of these is a guard we should
 * have written — the branch is a safety net, not the intended path.
 */
export function toActionError(error: unknown): string {
  // A validation error carries no code — it is thrown when the query itself is
  // malformed, which in practice means a stale generated client. Its message
  // is a dump of the whole query object and must never reach a counter.
  if (isPrismaError(error) && !("code" in error)) {
    return "The server could not save that. Please try again, and tell whoever runs the system if it keeps happening.";
  }
  if (isPrismaKnownError(error)) {
    switch (error.code) {
      case "P2002":
        return "That record already exists. Refresh the page and check before trying again.";
      case "P2025":
        return "That record no longer exists. Somebody may have changed it while this page was open.";
      case "P2003":
        return "Something this record depends on is missing. Refresh the page and try again.";
      default:
        return "The database refused that change. Refresh the page and try again.";
    }
  }
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

/**
 * Structural check rather than `instanceof`. The action layer must not import
 * @prisma/client at runtime just to name an error class, and a client
 * regenerated at a different version would break the identity check anyway.
 */
/** Any error thrown by the Prisma client, by class name. */
function isPrismaError(error: unknown): error is { name: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof (error as { name: unknown }).name === "string" &&
    (error as { name: string }).name.startsWith("PrismaClient")
  );
}

function isPrismaKnownError(
  error: unknown
): error is { code: string; clientVersion: string } {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code: unknown }).code === "string" &&
    /^P\d{4}$/.test((error as { code: string }).code) &&
    "clientVersion" in error
  );
}
