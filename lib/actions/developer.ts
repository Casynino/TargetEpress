"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { recordDeveloperAudit } from "@/lib/developer";
import { canWorkAs, WORK_AS_COOKIE } from "@/lib/developer-shared";
import {
  clearWorkAsCookie,
  decodeWorkAs,
  setWorkAsCookie,
} from "@/lib/developer-workas";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { authorizeRealDeveloper } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { cookies } from "next/headers";
import { fail, toActionError, type ActionResult } from "@/lib/actions/types";

/**
 * Looking at the app as somebody else — see lib/developer-workas.ts for what
 * keeps the cookie honest. These two actions are the only ways it starts and
 * ends, and both write the line the cookie is later checked against.
 */

/** Start. One click: the reason is optional because every start is on the
    trail either way. The line is written BEFORE the
    cookie: no audit row means no work-as, never the other way round. */
export async function startWorkingAs(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  let developer;
  try {
    developer = await authorizeRealDeveloper();
  } catch (error) {
    return fail(toActionError(error));
  }

  const targetId = String(formData.get("userId") ?? "");
  const typedReason = String(formData.get("reason") ?? "").trim();

  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, name: true, role: true, active: true, status: true },
  });
  const reason = typedReason || `Opened the app as ${target?.name ?? "an account"}.`;
  if (!target || !canWorkAs(target, developer.id)) {
    await recordDeveloperAudit({
      actor: developer,
      action: "developer.workas.refused",
      entity: "User",
      entityId: targetId || null,
      summary: "Refused an attempt to look as an account that cannot be looked as",
      outcome: "failure",
      reason,
    });
    return fail(t(locale, "You cannot work as that account."));
  }

  const aid = await recordDeveloperAudit({
    actor: developer,
    action: "developer.workas.start",
    entity: "User",
    entityId: target.id,
    summary: `Started working as ${target.name}`,
    reason,
    before: { workingAs: null },
    after: { workingAs: { id: target.id, name: target.name, role: target.role } },
  });
  await setWorkAsCookie({
    dev: developer.id,
    target: target.id,
    aid,
    at: Date.now(),
  });

  revalidatePath("/app", "layout");
  redirect("/app/dashboard");
}

/** Stop. Always allowed to the real Developer, and idempotent: pressing it with
    nothing on is a harmless no-op, not an error. */
export async function stopWorkingAs(): Promise<void> {
  const developer = await authorizeRealDeveloper();
  const store = await cookies();
  const payload = decodeWorkAs(store.get(WORK_AS_COOKIE)?.value);

  if (payload && payload.dev === developer.id) {
    await recordDeveloperAudit({
      actor: developer,
      action: "developer.workas.stop",
      entity: "User",
      entityId: payload.target,
      summary: "Stopped working as another account",
      reason: "Ended by the Developer.",
      before: { workingAs: payload.target },
      after: { workingAs: null },
    });
  }
  await clearWorkAsCookie();
  revalidatePath("/app", "layout");
  redirect("/app/developer");
}
