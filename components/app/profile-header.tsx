import { BadgeCheck, Building2, CalendarDays, IdCard } from "lucide-react";

import { cn } from "@/lib/utils";

export type ProfileIdentity = {
  name: string;
  email: string;
  employeeId: string | null;
  departmentLabel: string;
  roleLabel: string;
  rankLabel: string | null;
  photoUrl: string | null;
  joinedLabel: string;
  online: boolean;
  lastSeenLabel: string | null;
  status: string;
};

/**
 * The top of a profile: who this is, at a glance.
 *
 * A warehouse has people on three shifts who mostly know each other by face and
 * first name. The photo is doing real work here, and the employee number under
 * it is what a manager quotes when something needs chasing.
 */
export function ProfileHeader({
  identity,
  actions,
}: {
  identity: ProfileIdentity;
  actions?: React.ReactNode;
}) {
  const initials = identity.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <section className="panel mb-6 overflow-hidden">
      <div className="flex flex-wrap items-start gap-5 p-6">
        <div className="relative shrink-0">
          {identity.photoUrl ? (
            /* A plain img: staff photos live on the same storage as cargo
               photos, which may not be in the Next image allow-list. */
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={identity.photoUrl}
              alt={identity.name}
              className="h-20 w-20 rounded-2xl border object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-2xl border bg-muted font-display text-2xl font-bold text-muted-foreground">
              {initials || "?"}
            </div>
          )}
          <span
            title={
              identity.online
                ? "Online now"
                : identity.lastSeenLabel
                  ? `Last seen ${identity.lastSeenLabel}`
                  : "Never signed in"
            }
            className={cn(
              "absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-2 border-card",
              identity.online ? "bg-success" : "bg-muted-foreground/40"
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-bold leading-tight">
            {identity.name}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {identity.email}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Building2 className="h-3.5 w-3.5" />
              {identity.departmentLabel}
            </span>
            {/* Warehouse roles are named after their department, so without a
                rank this chip would just repeat the line before it. */}
            {(identity.rankLabel ?? identity.roleLabel) !== identity.departmentLabel ? (
              <span className="inline-flex items-center gap-1.5">
                <BadgeCheck className="h-3.5 w-3.5" />
                {identity.rankLabel ?? identity.roleLabel}
              </span>
            ) : null}
            {identity.employeeId ? (
              <span className="inline-flex items-center gap-1.5 font-mono tabular">
                <IdCard className="h-3.5 w-3.5" />
                {identity.employeeId}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              Joined {identity.joinedLabel}
            </span>
          </div>

          <p className="mt-2 text-xs">
            <span
              className={cn(
                "font-medium",
                identity.online ? "text-success" : "text-muted-foreground"
              )}
            >
              {identity.online
                ? "Online now"
                : identity.lastSeenLabel
                  ? `Last active ${identity.lastSeenLabel}`
                  : "Has never signed in"}
            </span>
            {identity.status !== "ACTIVE" ? (
              <span className="ml-2 rounded-full bg-warning/10 px-2 py-0.5 font-medium text-warning">
                {identity.status === "SUSPENDED" ? "Suspended" : "Inactive"}
              </span>
            ) : null}
          </p>
        </div>

        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </section>
  );
}
