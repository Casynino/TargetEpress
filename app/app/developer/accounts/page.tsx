import type { Metadata } from "next";

import { DeveloperAccountTool } from "@/components/app/developer-account-tool";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/constants";
import { formatTanzania } from "@/lib/developer-shared";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Accounts") };
}

/**
 * Staff accounts from the developer's desk: the same four actions and the same
 * rails as the staff screen, plus a review step and a mandatory reason.
 */
export default async function DeveloperAccountsPage() {
  const actor = await requirePermission("developer.access");
  const locale = await viewerLocale();
  const users = await prisma.user.findMany({
    orderBy: [{ active: "desc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true, active: true, lastLoginAt: true },
  });
  /* Every role but Developer: that one is never given from a screen. */
  const roles = Object.entries(ROLE_LABELS)
    .filter(([value]) => value !== "DEVELOPER")
    .map(([value, label]) => ({ value, label: t(locale, label) }));

  return (
    <>
      <PageHeader
        title={t(locale, "Accounts")}
        description={t(
          locale,
          "Change a role, suspend or reactivate someone, or reset a password. Each change is explained before it happens and needs a reason."
        )}
      />
      <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
        <ul className="divide-y">
          {users.map((person) => (
            <li key={person.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{person.name}</p>
                <p className="text-xs text-muted-foreground">{person.email}</p>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  <Badge variant={person.role === "DEVELOPER" ? "brand" : "outline"}>
                    {t(locale, ROLE_LABELS[person.role])}
                  </Badge>
                  {!person.active ? <Badge variant="destructive">{t(locale, "suspended")}</Badge> : null}
                  <span className="text-muted-foreground">
                    {t(locale, "Last sign-in")}: {person.lastLoginAt ? formatTanzania(person.lastLoginAt) : t(locale, "Never")}
                  </span>
                </p>
              </div>
              <div className="w-full sm:w-auto sm:min-w-[22rem]">
                {person.role === "DEVELOPER" || person.id === actor.id ? (
                  <p className="text-right text-xs text-muted-foreground">{t(locale, "Secure setup only")}</p>
                ) : (
                  <DeveloperAccountTool
                    manage={person.role !== "ADMIN"}
                    person={{
                      id: person.id,
                      name: person.name,
                      roleKey: person.role,
                      roleLabel: t(locale, ROLE_LABELS[person.role]),
                      active: person.active,
                    }}
                    roles={roles}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
