import { NextResponse } from "next/server";

import { can } from "@/lib/rbac";
import { currentUser } from "@/lib/session";
import { runStorageMeter } from "@/lib/storage-meter";

/**
 * THE NIGHTLY RUN OF THE STORAGE METER.
 *
 * Called by Vercel's scheduler once a day (see vercel.json), and reachable by
 * hand from Finance when somebody wants today's figures before the schedule
 * gets to them.
 *
 * NOTHING HERE ACCUMULATES, so a night the scheduler is down costs nothing:
 * each bill is written to what the policy says today, not nudged up by a day.
 * The morning run catches up by itself. See runStorageMeter.
 *
 * TWO DOORS, ONE OF THEM UNAUTHENTICATED BY DESIGN. Vercel's scheduler cannot
 * sign in, so it proves itself with the shared secret in CRON_SECRET; a
 * person proves themselves with their session. With no secret configured the
 * scheduler's door is shut rather than left open — an endpoint that moves
 * money must never be reachable by anybody who knows the URL.
 */
export const dynamic = "force-dynamic";

async function run(request: Request) {
  const secret = process.env.CRON_SECRET;
  const offered = request.headers.get("authorization");
  const scheduled = Boolean(secret) && offered === `Bearer ${secret}`;

  if (!scheduled) {
    const user = await currentUser();
    if (!user || !can(user.role, "invoice.edit")) {
      return NextResponse.json({ error: "Not authorised" }, { status: 403 });
    }
    /* ?dry=1 works out the whole sweep and writes nothing — what the first
       real run would put on the books, before it puts it there. */
    const dryRun = new URL(request.url).searchParams.get("dry") === "1";
    const byHand = await runStorageMeter({ actor: user, dryRun });
    return NextResponse.json({
      ok: true,
      by: dryRun ? "dry run" : "hand",
      totalUsd: byHand.charged.reduce((sum, c) => sum + c.usd, 0),
      ...byHand,
    });
  }

  const swept = await runStorageMeter();
  /* Logged as well as returned: the scheduler's own answer is read by nobody
     unless something looks wrong, and this is what "nothing looked wrong" is
     supposed to look like in the Vercel log. */
  console.info("Storage meter", {
    looked: swept.looked,
    charged: swept.charged.length,
    held: swept.held,
    failed: swept.failed.length,
  });
  return NextResponse.json({ ok: true, by: "schedule", ...swept });
}

export async function GET(request: Request) {
  return run(request);
}

/* Vercel's scheduler uses GET; POST is here for a manual run from a terminal
   without a browser session getting in the way. */
export async function POST(request: Request) {
  return run(request);
}
