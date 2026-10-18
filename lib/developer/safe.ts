import "server-only";

/**
 * A read that may fail without taking the page down — and without failing
 * SILENTLY. `safe` returns its fallback, but the reason is kept, so the Home
 * can say "three readings could not be made, and here is why" instead of
 * showing zeros that look like a quiet business. A column the code expects but
 * the database lacks (a schema push that was forgotten) shows up here first.
 *
 * One guard per request: failures are collected in the closure, never in module
 * state, so two people loading the Home at once cannot see each other's.
 */
export function guard() {
  const failures: string[] = [];
  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (error) {
      failures.push(describe(error));
      return fallback;
    }
  };
  return { safe, failures };
}

/** The part of a database error a person can act on, without the query text. */
export function describe(error: unknown): string {
  const e = error as { code?: string; message?: string; meta?: { column?: string; table?: string } };
  const last =
    String(e?.message ?? error)
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .pop() ?? "unknown error";
  return `${e?.code ? `${e.code}: ` : ""}${last}`.slice(0, 220);
}
