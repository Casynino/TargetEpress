import { cache } from "react";
import { redirect } from "next/navigation";
import type { Department, Role } from "@prisma/client";

import { auth } from "@/auth";
import { recordDeniedAttempt } from "@/lib/developer";
import {
  DEVELOPER,
  DEVELOPER_SESSION_HOURS,
  type ImpersonatedBy,
} from "@/lib/developer-shared";
import { activeWorkAs } from "@/lib/developer-workas";
import { prisma } from "@/lib/prisma";
import { can, type Permission } from "@/lib/rbac";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: Department;
  /**
   * Set when the Developer is looking at the app AS this person ("work as").
   * Everything above is then the person's — so every screen and permission
   * check shows exactly what they would see — and this is who is really there.
   * See lib/developer-workas.ts.
   */
  impersonatedBy?: ImpersonatedBy | null;
};

/**
 * THE SESSION SAYS WHO. THE DATABASE SAYS WHAT THEY MAY DO.
 *
 * The signed token carries the role and the department, and it carries them
 * unchanged from the moment somebody signed in — the jwt callback writes them
 * once and there is no branch that ever reads them again. So suspending a
 * member of staff took effect only when their token expired, and demoting one
 * took effect only then too: for up to a working day, a person who had been
 * removed kept recording payments with the authority they used to have.
 *
 * One indexed read by primary key, cached for the request, so a page that
 * checks a permission six times asks once. What it costs is a millisecond;
 * what it buys is that "remove access" means now.
 */
const liveUser = cache(async (id: string) => {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      active: true,
      status: true,
    },
  });
});

/**
 * Who is asking, as the database currently describes them.
 *
 * Null when there is no session, and null when the account behind the session
 * has been suspended or removed — the same two tests the login screen makes,
 * asked again on every request rather than once at sign-in.
 */
async function realViewer(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await liveUser(session.user.id);

  /*
    THE SESSION MUST STILL MATCH THE ACCOUNT, EVERY REQUEST.

    Sign-in decides the session's kind from the account row and stamps it on
    the token. It is checked against the live row on every request rather than
    trusted, so that a role changed underneath a live session can never leave
    "signed in as staff, acting as developer" — the silent identity change this
    feature promises cannot happen.

    And the Developer session has a hard stop. It is the account that can see
    everything, so it does not roll forward with use like a clerk's does.
  */
  if (user) {
    const developerRow = user.role === DEVELOPER;
    if (developerRow !== (session.accountType === "developer")) {
      revoked = true;
      return null;
    }
    if (
      developerRow &&
      (session.signedInAt === null ||
        Date.now() - session.signedInAt > DEVELOPER_SESSION_HOURS * 3_600_000)
    ) {
      revoked = true;
      developerExpired = true;
      return null;
    }
  }

  if (!user || !user.active || user.status !== "ACTIVE") {
    /* Distinguished from "not signed in", because the cookie is still valid
       and the middleware would otherwise bounce them straight back off the
       login page into the app, and the app straight back to login. See
       revokedRedirect below. */
    revoked = true;
    return null;
  }

  return {
    id: user.id,
    name: user.name ?? user.email ?? "Unknown",
    email: user.email,
    role: user.role,
    department: user.department,
  };
}

/**
 * WHO IS ASKING — the person on the screen, which is not always the person at
 * the keyboard.
 *
 * Almost always the same. The exception is a Developer who has chosen to look
 * at the app as a member of staff: then every page and permission check sees
 * that member of staff, exactly as they would, and `impersonatedBy` says who is
 * really there. Only a real Developer session is ever asked the question.
 */
async function viewer(): Promise<SessionUser | null> {
  const real = await realViewer();
  if (!real || real.role !== DEVELOPER) return real;

  const looking = await activeWorkAs(real.id);
  if (!looking) return real;
  return {
    ...looking,
    impersonatedBy: { id: real.id, name: real.name, email: real.email },
  };
}

/**
 * Set by viewer() when the session is real but the account behind it is not.
 *
 * A module-level flag rather than a return value because viewer() has three
 * callers with three different shapes, and only the redirecting one needs to
 * know the difference. It is read immediately after the call that sets it.
 */
let revoked = false;
/** The Developer's four hours ran out — said as such on the login page. */
let developerExpired = false;

/** For pages: bounce to login when there is no session. */
export async function requireUser(): Promise<SessionUser> {
  const user = await viewer();
  if (!user) {
    /*
      A SUSPENDED ACCOUNT MUST NOT LOOP.

      Their cookie is still valid, so middleware sees a signed-in person on
      /login and sends them to the dashboard, which sends them back here. The
      marker tells middleware to let the login page render, and the page tells
      them what happened instead of leaving them staring at a form that was
      working ten minutes ago.
    */
    redirect(
      developerExpired
        ? "/login?revoked=1&dev=1"
        : revoked
          ? "/login?revoked=1"
          : "/login"
    );
  }
  return user;
}

/** For pages: bounce to the no-access screen when the permission is missing. */
export async function requirePermission(
  permission: Permission
): Promise<SessionUser> {
  const user = await requireUser();
  if (!can(user.role, permission)) redirect("/app/no-access");
  return user;
}

/**
 * For server actions. Throws instead of redirecting so the caller can return a
 * typed error to the form rather than a mystery navigation.
 */
export async function authorize(permission: Permission): Promise<SessionUser> {
  const user = await viewer();
  if (!user) throw new Error("Not signed in.");
  /*
    WORKING AS SOMEBODY IS FULL ACCESS AS THEM — NOTHING IS CLOSED.

    The Developer may do whatever the person they are working as may do:
    accounts, roles, passwords, money, all of it. The owner chose this
    knowingly and more than once, so there is no list of refusals here. The
    check below is simply that person's own permission, and every line a
    Developer writes is recorded under the DEVELOPER with the borrowed identity
    in the metadata (lib/audit.ts), so the trail always says who really did it
    and as whom.
  */
  if (!can(user.role, permission)) {
    /* A refused action by the Developer goes on the audit trail as a failure.
       Awaited — and never throws — so the record exists by the time the
       refusal reaches the person, and a log that failed cannot change it. */
    await recordDeniedAttempt(user, permission);
    throw new Error("You do not have permission to do that.");
  }
  return user;
}

export async function currentUser(): Promise<SessionUser | null> {
  return viewer();
}

/**
 * For the few actions that belong to the REAL Developer even while they are
 * looking as somebody else — starting a work-as, and stopping one.
 *
 * Reads the signed-in session itself, not the borrowed identity: while looking
 * as Hawa the effective user is Hawa, who holds none of this. Refuses anybody
 * who is not the Developer, and records the refusal.
 */
export async function authorizeRealDeveloper(): Promise<SessionUser> {
  const real = await realViewer();
  if (!real) throw new Error("Not signed in.");
  if (real.role !== DEVELOPER || !can(real.role, "developer.access")) {
    await recordDeniedAttempt(real, "developer.access");
    throw new Error("You do not have permission to do that.");
  }
  return real;
}
