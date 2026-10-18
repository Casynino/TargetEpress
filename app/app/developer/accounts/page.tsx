import type { Metadata } from "next";

import { DeveloperAccountTool } from "@/components/app/developer-account-tool";
import { DeveloperAddPerson } from "@/components/app/developer-add-person";
import { AccessSearch } from "@/components/developer/access-search";
import { Initials, ROLE_INFO } from "@/components/developer/home-sections";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/constants";
import { timeAgo, eat } from "@/lib/developer/format";
import { NOT_REMOVED } from "@/lib/developer-shared";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Access" };
export const dynamic = "force-dynamic";

const ORDER = [
  "ADMIN",
  "MANAGER",
  "FINANCE",
  "CUSTOMER_CARE",
  "CHINA_WAREHOUSE",
  "DAR_WAREHOUSE",
  "DEVELOPER",
] as const;

/**
 * EVERY ACCOUNT, GROUPED BY WHAT THEY DO, WITH THE ONE BUTTON THAT MATTERS.
 *
 * "Work as" is on the person's row and opens the app as them in one press:
 * it is always on the trail, so it asks nothing first.
 * Suspend / role / password change the account, so each is a short inline
 * form with the reason the server insists on.
 */
export default async function DeveloperAccessPage() {
  const actor = await requirePermission("developer.access");
  const users = await prisma.user.findMany({
    where: NOT_REMOVED,
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      lastLoginAt: true,
    },
  });
  /* Every role but Developer: that one is never given from a screen. */
  const roles = Object.entries(ROLE_LABELS)
    .filter(([value]) => value !== "DEVELOPER")
    .map(([value, label]) => ({ value, label }));

  const total = users.length;
  const suspendedCount = users.filter((u) => !u.active).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            Developer console
          </p>
          <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">
            Access
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {total} accounts
            {suspendedCount > 0 ? ` (${suspendedCount} suspended)` : ""}. Pick a
            person and press Work as to open their screens exactly as they see
            them. Everything you do is recorded under your name.
          </p>
        </div>
        <DeveloperAddPerson roles={roles} />
      </div>

      <AccessSearch />

      {ORDER.map((role) => {
        const group = users.filter((u) => u.role === role);
        if (group.length === 0) return null;
        const info = ROLE_INFO[role];
        const Icon = info.icon;
        return (
          <section key={role} data-group className="space-y-3">
            <div className="flex items-center gap-3.5 px-1">
              <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Icon className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold leading-tight">
                  {info.label}{" "}
                  <span className="font-normal text-muted-foreground">
                    · {group.length}
                  </span>
                </h2>
                <p className="text-sm text-muted-foreground">{info.text}</p>
              </div>
            </div>
            <Card>
              <CardContent className="p-0">
                <ul className="divide-y divide-border">
                  {group.map((person) => (
                    <li
                      key={person.id}
                      data-person={`${person.name} ${person.email} ${ROLE_LABELS[person.role]}`.toLowerCase()}
                      className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <Initials
                          name={person.name}
                          className="size-12 text-sm"
                        />
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold">
                              {person.name}
                            </span>
                            {person.id === actor.id ? (
                              <Badge variant="brand">You</Badge>
                            ) : person.active ? (
                              <span className="text-xs font-medium text-success">
                                Active
                              </span>
                            ) : (
                              <Badge variant="destructive">Suspended</Badge>
                            )}
                            <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                              {ROLE_LABELS[person.role]}
                            </span>
                          </p>
                          <p className="mt-0.5 truncate text-sm text-muted-foreground">
                            {person.email}
                          </p>
                          <p
                            className="text-xs text-muted-foreground"
                            title={
                              person.lastLoginAt
                                ? eat(person.lastLoginAt)
                                : undefined
                            }
                          >
                            {person.lastLoginAt
                              ? `Last signed in ${timeAgo(person.lastLoginAt)}`
                              : "Never signed in"}
                          </p>
                        </div>
                      </div>
                      <div className="w-full sm:w-auto">
                        {person.role === "DEVELOPER" ||
                        person.id === actor.id ? (
                          <p className="text-right text-xs text-muted-foreground">
                            Secure setup only
                          </p>
                        ) : (
                          <DeveloperAccountTool
                            person={{
                              id: person.id,
                              name: person.name,
                              roleKey: person.role,
                              roleLabel: ROLE_LABELS[person.role],
                              active: person.active,
                            }}
                            roles={roles}
                          />
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </section>
        );
      })}
    </div>
  );
}
