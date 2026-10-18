import "server-only";

import { ROLE_LABELS } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

/** The order people think of the company in: the owner first, the floor last. */
const ORDER = [
  "ADMIN",
  "MANAGER",
  "FINANCE",
  "CUSTOMER_CARE",
  "CHINA_WAREHOUSE",
  "DAR_WAREHOUSE",
];

/**
 * Everyone the Developer may look as: signed-in-able accounts, never a
 * Developer. The same test `canWorkAs` applies when the press arrives, so the
 * list cannot offer a name the server would then refuse.
 */
export async function workAsPeople() {
  const users = await prisma.user.findMany({
    where: { active: true, status: "ACTIVE", role: { not: "DEVELOPER" } },
    select: { id: true, name: true, role: true },
  });
  return users
    .sort(
      (a, b) =>
        ORDER.indexOf(a.role) - ORDER.indexOf(b.role) ||
        a.name.localeCompare(b.name),
    )
    .map((u) => ({ id: u.id, name: u.name, roleLabel: ROLE_LABELS[u.role] }));
}
