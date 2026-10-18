/**
 * Next calls this for every error the server did not expect: a page that
 * crashed, an action or a route that threw. The error is recorded (with personal
 * details removed — see lib/developer/server-errors.ts) so the Developer Home
 * can say how many there were, instead of the first to know being a member of
 * staff on the phone.
 *
 * Node only: the Edge runtime has no database client.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routeType?: string; routePath?: string },
) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordServerError } = await import("@/lib/developer/server-errors");
  await recordServerError(error, request, context);
}
