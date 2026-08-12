import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ShieldAlert } from "lucide-react";

import { ActivityBars } from "@/components/app/activity-bars";
import { ProfileHeader } from "@/components/app/profile-header";
import { Button } from "@/components/ui/button";
import { DEPARTMENT_LABELS, ROLE_LABELS } from "@/lib/constants";
import { formatDate, formatDateTime, formatRelative } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import {
  dailyActivity,
  isOnline,
  loginHistory,
  myBatches,
  profileActivity,
  profileStats,
} from "@/lib/profile";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Employee" };

const RANK_LABELS: Record<string, string> = {
  OPERATOR: "Warehouse Operator",
  MANAGER: "Warehouse Manager",
};

/**
 * The CEO's view of one employee.
 *
 * Everything the employee sees on their own profile, plus the things they do
 * not: where they signed in from, what they edited, and what they deleted.
 * That asymmetry is the point — an employee's profile is for their work, this
 * one is for answering questions about it.
 *
 * Gated on `user.manage`, which only the CEO holds.
 */
export default async function EmployeeProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("user.manage");
  const locale = await viewerLocale();
  const { id } = await params;

  const person = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      emergencyContact: true,
      employeeId: true,
      role: true,
      department: true,
      rank: true,
      photoUrl: true,
      status: true,
      active: true,
      joinedAt: true,
      lastActiveAt: true,
      lastLoginAt: true,
      createdBy: { select: { name: true } },
    },
  });
  if (!person) notFound();

  const [stats, activity, batches, daily, logins, edits, deletions] =
    await Promise.all([
      profileStats(person.id),
      profileActivity(person.id, 20, locale),
      myBatches(person.id, locale),
      dailyActivity(person.id, 14, locale),
      loginHistory(person.id, 12, locale),
      prisma.auditLog.count({
        where: { actorId: person.id, action: { contains: "update" } },
      }),
      prisma.shipment.count({
        where: { deletedById: person.id, deletedAt: { not: null } },
      }),
    ]);

  return (
    <>
      <div className="mb-4">
        <Button asChild variant="ghost" size="sm">
          <Link href="/app/admin/users">
            <ArrowLeft className="mr-2 h-4 w-4" />
            {t(locale, "All staff")}
          </Link>
        </Button>
      </div>

      <ProfileHeader
        identity={{
          name: person.name,
          email: person.email,
          employeeId: person.employeeId,
          departmentLabel: DEPARTMENT_LABELS[person.department],
          roleLabel: ROLE_LABELS[person.role],
          rankLabel: person.rank ? RANK_LABELS[person.rank] : null,
          photoUrl: person.photoUrl,
          joinedLabel: formatDate(person.joinedAt, locale),
          online: isOnline(person.lastActiveAt),
          lastSeenLabel: person.lastActiveAt
            ? formatRelative(person.lastActiveAt, locale)
            : null,
          status: person.status,
        }}
      />

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Shipments registered", value: stats.totalShipments },
          {
            label: "Weight processed",
            value: `${stats.totalWeightKg.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`,
          },
          { label: "Labels printed", value: stats.labelsPrinted },
          { label: "Batches worked on", value: stats.batchesTouched },
        ].map((item) => (
          <div key={item.label} className="panel p-5">
            <p className="text-xs text-muted-foreground">
              {t(locale, item.label)}
            </p>
            <p className="mt-1.5 font-display text-2xl font-bold tabular">
              {item.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <section className="panel">
            <div className="border-b px-5 py-4">
              <h2 className="font-display font-semibold">
                {t(locale, "Last two weeks")}
              </h2>
              <p className="text-xs text-muted-foreground">
                {t(locale, "Shipments registered per day")}
              </p>
            </div>
            <div className="p-5">
              <ActivityBars
                points={daily.map((d) => ({ label: d.label, value: d.shipments }))}
                unit={t(locale, "shipments")}
              />
            </div>
          </section>

          <section className="panel">
            <h2 className="border-b px-5 py-4 font-display font-semibold">
              {t(locale, "Audit history")}
            </h2>
            {activity.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                {t(locale, "Nothing recorded against this account.")}
              </p>
            ) : (
              <ol className="divide-y">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex gap-4 px-5 py-3">
                    <div className="w-24 shrink-0 text-xs text-muted-foreground">
                      <p className="tabular">{entry.timeLabel}</p>
                      <p className="tabular">{entry.dateLabel}</p>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm">{entry.summary}</p>
                      <p className="font-mono text-xs text-muted-foreground">
                        {entry.action}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-6">
          {/* The part the employee cannot see about themselves. */}
          <section className="panel">
            <h2 className="flex items-center gap-2 border-b px-5 py-4 font-display font-semibold">
              <ShieldAlert className="h-4 w-4" />
              {t(locale, "Oversight")}
            </h2>
            <dl className="divide-y">
              {[
                {
                  label: "Last sign-in",
                  value: person.lastLoginAt
                    ? formatDateTime(person.lastLoginAt, locale)
                    : t(locale, "Never"),
                },
                {
                  label: "Last active",
                  value: person.lastActiveAt
                    ? formatRelative(person.lastActiveAt, locale)
                    : t(locale, "Never"),
                },
                { label: "Edits made", value: String(edits) },
                {
                  label: "Records deleted",
                  value: String(deletions),
                },
                {
                  label: "Account created by",
                  value: person.createdBy?.name ?? t(locale, "System"),
                },
                {
                  label: "Emergency contact",
                  value: person.emergencyContact ?? t(locale, "Not given"),
                },
                {
                  label: "Phone",
                  value: person.phone ?? t(locale, "Not given"),
                },
              ].map((item) => (
                <div key={item.label} className="px-5 py-3">
                  <dt className="text-xs text-muted-foreground">
                    {t(locale, item.label)}
                  </dt>
                  <dd className="mt-0.5 text-sm font-medium">{item.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="panel">
            <h2 className="border-b px-5 py-4 font-display font-semibold">
              {t(locale, "Sign-in history")}
            </h2>
            {logins.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                {t(locale, "No sign-ins recorded yet.")}
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {logins.map((login) => (
                  <li key={login.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={
                          login.ok ? "text-foreground" : "font-medium text-destructive"
                        }
                      >
                        {login.ok
                          ? t(locale, "Signed in")
                          : t(locale, "Failed attempt")}
                      </span>
                      <span className="text-xs text-muted-foreground tabular">
                        {login.atLabel}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {login.device}
                      {login.ipAddress ? ` · ${login.ipAddress}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2 className="border-b px-5 py-4 font-display font-semibold">
              {t(locale, "Batches")}
            </h2>
            {batches.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                {t(locale, "Has not put cargo on a batch.")}
              </p>
            ) : (
              <ul className="divide-y">
                {batches.slice(0, 6).map((batch) => (
                  <li
                    key={batch.id}
                    className="flex items-center justify-between gap-2 px-5 py-3"
                  >
                    <span className="font-mono text-sm tabular">
                      {batch.batchNumber}
                    </span>
                    <span className="text-xs text-muted-foreground tabular">
                      {batch.shipments} · {batch.weightKg.toFixed(1)} kg
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
