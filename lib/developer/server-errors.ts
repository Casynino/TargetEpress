import "server-only";

import { prisma } from "@/lib/prisma";

/**
 * AN UNEXPECTED SERVER ERROR LEAVES A LINE, WITH THE PERSONAL DETAILS TAKEN OUT.
 *
 * Before this, a page that crashed left no trace in the app: the only record was
 * in Vercel's logs, which nobody opens until staff complain. Now the error is
 * written to the audit log as action `system.error` and the Developer Home
 * counts them.
 *
 * ONLY WHAT CANNOT IDENTIFY ANYBODY IS KEPT: the message with emails and long
 * numbers blanked out, and the page path with record ids replaced by ":id". No
 * request body, no cookies, no query string, no stack.
 *
 * Mistakes people make — a wrong password, a refused action — are not server
 * errors and never reach here.
 *
 * BOUNDED, SO A CRASH LOOP CANNOT FLOOD THE DATABASE: the same message on the
 * same path is written at most once a minute per server instance, and a
 * instance writes at most thirty lines a minute in all. It never throws: the
 * error handler failing would only hide the original error.
 */

const window = new Map<string, number>();
let minuteStart = 0;
let minuteCount = 0;

/** Business refusals that are thrown as errors on purpose — not bugs. */
const EXPECTED =
  /^(NEXT_REDIRECT|NEXT_NOT_FOUND|You do not have permission|Not signed in|Your session has expired)/i;

export function cleanMessage(raw: unknown): string {
  const first =
    String((raw as { message?: string })?.message ?? raw)
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "Unknown error";
  return first
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{6,}\d/g, "[number]")
    .slice(0, 200);
}

export function cleanPath(path: string): string {
  return path
    .split("?")[0]
    .split("/")
    .map((seg) =>
      /^[a-z0-9]{20,}$/i.test(seg) ||
      /^\d{3,}$/.test(seg) ||
      /^(TX|CP|INV|CUS|GL|EXP|PAY|SUB)-[\w-]+$/i.test(seg)
        ? ":id"
        : seg,
    )
    .join("/")
    .slice(0, 160);
}

export async function recordServerError(
  error: unknown,
  request: { path: string; method: string },
  context: { routeType?: string; routePath?: string },
) {
  try {
    const message = cleanMessage(error);
    if (EXPECTED.test(message)) return;

    const now = Date.now();
    if (now - minuteStart > 60_000) {
      minuteStart = now;
      minuteCount = 0;
    }
    if (minuteCount >= 30) return;

    const path = cleanPath(request.path);
    const key = `${message}|${path}`;
    const seen = window.get(key);
    if (seen && now - seen < 60_000) return;
    window.set(key, now);
    if (window.size > 500) window.clear();
    minuteCount += 1;

    await prisma.auditLog.create({
      data: {
        action: "system.error",
        entity: "System",
        summary: message,
        metadata: {
          path,
          method: request.method,
          routeType: context.routeType ?? null,
          digest: (error as { digest?: string })?.digest ?? null,
        },
      },
    });
  } catch {
    /* Never let the error recorder become the error. */
  }
}
