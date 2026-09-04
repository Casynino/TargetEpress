import { cache } from "react";
import { redirect } from "next/navigation";
import type { Department, Role } from "@prisma/client";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { can, type Permission } from "@/lib/rbac";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: Department;
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
async function viewer(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await liveUser(session.user.id);
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
 * Set by viewer() when the session is real but the account behind it is not.
 *
 * A module-level flag rather than a return value because viewer() has three
 * callers with three different shapes, and only the redirecting one needs to
 * know the difference. It is read immediately after the call that sets it.
 */
let revoked = false;

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
    redirect(revoked ? "/login?revoked=1" : "/login");
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
  if (!can(user.role, permission)) {
    throw new Error("You do not have permission to do that.");
  }
  return user;
}

export async function currentUser(): Promise<SessionUser | null> {
  return viewer();
}
