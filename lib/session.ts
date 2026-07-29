import { redirect } from "next/navigation";
import type { Department, Role } from "@prisma/client";

import { auth } from "@/auth";
import { can, type Permission } from "@/lib/rbac";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: Department;
};

/** For pages: bounce to login when there is no session. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "Unknown",
    email: session.user.email ?? "",
    role: session.user.role,
    department: session.user.department,
  };
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
  const session = await auth();
  if (!session?.user?.id) throw new Error("Not signed in.");
  if (!can(session.user.role, permission)) {
    throw new Error("You do not have permission to do that.");
  }
  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "Unknown",
    email: session.user.email ?? "",
    role: session.user.role,
    department: session.user.department,
  };
}

export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? session.user.email ?? "Unknown",
    email: session.user.email ?? "",
    role: session.user.role,
    department: session.user.department,
  };
}
