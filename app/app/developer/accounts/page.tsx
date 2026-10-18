import type { Metadata } from "next";
import { Eye, UserPlus } from "lucide-react";

import { DeveloperAccountTool } from "@/components/app/developer-account-tool";
import { NewUserForm } from "@/components/app/user-admin";
import { InfoCallout } from "@/components/developer/info";
import { Initials, ROLE_INFO } from "@/components/developer/home-sections";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/constants";
import { timeAgo, eat } from "@/lib/developer/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Access" };
export const dynamic = "force-dynamic";

const ORDER = ["ADMIN", "MANAGER", "FINANCE", "CUSTOMER_CARE", "CHINA_WAREHOUSE", "DAR_WAREHOUSE", "DEVELOPER"] as const;

/**
 * EVERY ACCOUNT, GROUPED BY WHAT THEY DO, WITH THE ONE BUTTON THAT MATTERS.
 *
 * "Work as" is on the person's row and opens the app as them in one press:
 * it is view-only and always on the trail, so it asks nothing first.
 * Suspend / role / password change the account, so each is a short inline
 * form with the reason the server insists on.
 */
export default async function DeveloperAccessPage() {
  const actor = await requirePermission("developer.access");
  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true },
  });
  /* Every role but Developer: that one is never given from a screen. */
  const roles = Object.entries(ROLE_LABELS)
    .filter(([value]) => value !== "DEVELOPER")
    .map(([value, label]) => ({ value, label }));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">Access</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Everyone with an account. Press <strong className="text-foreground">Work as</strong> to open the app
            exactly as that person sees it.
          </p>
        </div>
      </div>

      {/* Same form the owner uses, and the same rules — plus the one the owner
          has and the manager does not: the Developer may open an owner account. */}
      <details className="group rounded-xl border bg-card shadow-soft open:pb-1">
        <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
          <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
            <UserPlus className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Add a person</span>
            <span className="block text-xs text-muted-foreground">
              Create an account for anyone — staff, manager or owner. They sign in with the email and password you set.
            </span>
          </span>
          <span className="rounded-full border px-3 py-1 text-xs font-medium group-open:hidden">Open</span>
        </summary>
        <div className="max-w-xl px-3 pb-3 [&>section]:border-0 [&>section]:shadow-none">
          <NewUserForm />
        </div>
      </details>

      <InfoCallout icon={Eye} title="What “Work as” does">
        You see the app as they see it, so you can help them or find why something looks different. It is view only:
        buttons that would change anything are refused and recorded, so money cannot move while you look. It ends by
        itself after 4 hours, or press Stop on the small pill in the corner.
      </InfoCallout>

      {ORDER.map((role) => {
        const group = users.filter((u) => u.role === role);
        if (group.length === 0) return null;
        const info = ROLE_INFO[role];
        const Icon = info.icon;
        return (
          <Card key={role}>
            <CardContent className="p-0">
              <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold">{info.label}</h2>
                    <p className="text-xs text-muted-foreground">{info.text}</p>
                  </div>
                </div>
                <span className="font-display text-xl font-semibold tabular-nums">{group.length}</span>
              </div>
              <ul className="divide-y divide-border">
                {group.map((person) => (
                  <li key={person.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <Initials name={person.name} className="size-9" />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {person.name}
                          {person.id === actor.id ? <Badge variant="brand">You</Badge> : null}
                          {!person.active ? <Badge variant="destructive">Suspended</Badge> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{person.email}</p>
                        <p
                          className="mt-0.5 text-xs text-muted-foreground"
                          title={person.lastLoginAt ? eat(person.lastLoginAt) : undefined}
                        >
                          {person.lastLoginAt ? `Last signed in ${timeAgo(person.lastLoginAt)}` : "Never signed in"}
                        </p>
                      </div>
                    </div>
                    <div className="w-full sm:w-auto sm:min-w-[20rem]">
                      {person.role === "DEVELOPER" || person.id === actor.id ? (
                        <p className="text-right text-xs text-muted-foreground">Secure setup only</p>
                      ) : (
                        <DeveloperAccountTool
                          manage={person.role !== "ADMIN"}
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
        );
      })}
    </div>
  );
}
