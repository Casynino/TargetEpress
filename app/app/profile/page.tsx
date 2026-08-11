import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  Boxes,
  ChevronRight,
  Package,
  Printer,
  Scale,
  Settings,
} from "lucide-react";

import { ActivityBars } from "@/components/app/activity-bars";
import { ProfileHeader } from "@/components/app/profile-header";
import { Button } from "@/components/ui/button";
import { DEPARTMENT_LABELS, ROLE_LABELS } from "@/lib/constants";
import { formatDate, formatRelative } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import {
  dailyActivity,
  isOnline,
  myBatches,
  profileActivity,
  profileStats,
} from "@/lib/profile";
import { requireUser } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "My profile" };

const RANK_LABELS: Record<string, string> = {
  OPERATOR: "Warehouse Operator",
  MANAGER: "Warehouse Manager",
};

/**
 * An employee's own profile.
 *
 * Deliberately a dashboard rather than a settings page. The settings are one
 * link away; what someone wants when they open their own profile is a picture
 * of their work — what they did today, what they have on the plane, and whether
 * it is more or less than last week.
 *
 * Everything is scoped to the signed-in user. There is no id in the URL, so
 * there is nothing to change to see somebody else's.
 */
export default async function MyProfilePage() {
  const session = await requireUser();
  const locale = await viewerLocale();

  const me = await prisma.user.findUnique({
    where: { id: session.id },
    select: {
      id: true,
      name: true,
      email: true,
      employeeId: true,
      role: true,
      department: true,
      rank: true,
      photoUrl: true,
      status: true,
      joinedAt: true,
      lastActiveAt: true,
    },
  });
  if (!me) redirect("/login");

  const [stats, activity, batches, daily] = await Promise.all([
    profileStats(me.id),
    profileActivity(me.id, 12),
    myBatches(me.id),
    dailyActivity(me.id, 14),
  ]);

  return (
    <>
      <ProfileHeader
        identity={{
          name: me.name,
          email: me.email,
          employeeId: me.employeeId,
          departmentLabel: DEPARTMENT_LABELS[me.department],
          roleLabel: ROLE_LABELS[me.role],
          rankLabel: me.rank ? RANK_LABELS[me.rank] : null,
          photoUrl: me.photoUrl,
          joinedLabel: formatDate(me.joinedAt, locale),
          online: isOnline(me.lastActiveAt),
          lastSeenLabel: me.lastActiveAt ? formatRelative(me.lastActiveAt, locale) : null,
          status: me.status,
        }}
        actions={
          <Button asChild variant="outline" size="sm" className="rounded-lg">
            <Link href="/app/profile/settings">
              <Settings className="mr-2 h-4 w-4" />
              {t(locale, "Edit profile")}
            </Link>
          </Button>
        }
      />

      {/* Today first. It is the only number anyone checks more than once. */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile
          icon={Package}
          label={t(locale, "Today's cargo")}
          value={String(stats.todayShipments)}
          hint={`${stats.todayWeightKg.toFixed(1)} kg recorded today`}
        />
        <Tile
          icon={Scale}
          label={t(locale, "This week")}
          value={String(stats.weekShipments)}
          hint={`${stats.monthShipments} in the last 30 days`}
        />
        <Tile
          icon={Printer}
          label={t(locale, "Labels printed")}
          value={String(stats.labelsPrinted)}
          hint={t(locale, "Sticker sheets you opened")}
        />
        <Tile
          icon={Boxes}
          label={t(locale, "Active batch")}
          value={stats.activeBatch ?? "—"}
          hint={
            stats.batchesTouched === 1
              ? t(locale, "1 batch worked on")
              : `${stats.batchesTouched} batches worked on`
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* Everything since day one, kept together and out of the way of the
              numbers that change hourly. */}
          <section className="panel">
            <div className="border-b px-5 py-4">
              <h2 className="font-display font-semibold">{t(locale, "All time")}</h2>
              <p className="text-xs text-muted-foreground">
                Since {formatDate(me.joinedAt, locale)}
              </p>
            </div>
            <dl className="grid gap-px bg-border sm:grid-cols-3">
              {[
                {
                  label: t(locale, "Shipments registered"),
                  value: stats.totalShipments.toLocaleString(),
                },
                {
                  label: t(locale, "Weight processed"),
                  value: `${stats.totalWeightKg.toLocaleString(undefined, {
                    maximumFractionDigits: 1,
                  })} kg`,
                },
                {
                  label: t(locale, "Packages registered"),
                  value: stats.totalPackages.toLocaleString(),
                },
              ].map((item) => (
                <div key={item.label} className="bg-card p-5">
                  <dt className="text-xs text-muted-foreground">{item.label}</dt>
                  <dd className="mt-1 font-display text-xl font-bold tabular">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="panel">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-4">
              <div>
                <h2 className="font-display font-semibold">
                  {t(locale, "Your last two weeks")}
                </h2>
                <p className="text-xs text-muted-foreground">
                  {t(locale, "Shipments you registered, per day")}
                </p>
              </div>
              <p className="font-display text-xl font-bold tabular">
                {daily.reduce((sum, d) => sum + d.shipments, 0)}
              </p>
            </div>
            <div className="p-5">
              <ActivityBars
                points={daily.map((d) => ({
                  label: d.label,
                  value: d.shipments,
                }))}
                unit={t(locale, "shipments")}
              />
            </div>
          </section>

          <section className="panel">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="font-display font-semibold">
                {t(locale, "Recent activity")}
              </h2>
              <span className="text-xs text-muted-foreground">
                {t(locale, "Your actions, newest first")}
              </span>
            </div>
            {activity.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">
                {t(
                  locale,
                  "Nothing recorded yet. Register a piece of cargo and it will appear here."
                )}
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
                      {entry.reference ? (
                        <p className="font-mono text-xs text-muted-foreground tabular">
                          {entry.reference}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="panel">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h2 className="font-display font-semibold">
                {t(locale, "My batches")}
              </h2>
              <Link
                href="/app/profile/batches"
                className="text-xs font-medium text-brand hover:underline"
              >
                {t(locale, "All")}
              </Link>
            </div>
            {batches.length === 0 ? (
              <p className="p-5 text-sm text-muted-foreground">
                {t(
                  locale,
                  "None yet — cargo you register joins a loading table automatically."
                )}
              </p>
            ) : (
              <ul className="divide-y">
                {batches.slice(0, 4).map((batch) => (
                  <li key={batch.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-mono text-sm font-semibold tabular">
                        {batch.batchNumber}
                      </p>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {t(locale, batch.statusLabel)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(locale, "Registered by you:")}{" "}
                      <span className="font-medium text-foreground tabular">
                        {batch.shipments}
                      </span>{" "}
                      · {batch.weightKg.toFixed(1)} kg
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2 className="border-b px-5 py-4 font-display font-semibold">
              {t(locale, "Your work")}
            </h2>
            <div className="divide-y">
              <ProfileLink
                href="/app/profile/shipments"
                title={t(locale, "My shipments")}
                detail={`${stats.totalShipments} you registered`}
              />
              <ProfileLink
                href="/app/profile/batches"
                title={t(locale, "My batches")}
                detail={`${stats.batchesTouched} you contributed to`}
              />
              {/* The whole floor's activity sits beside your own — this page
                  is already the answer to "what has been happening". */}
              <ProfileLink
                href="/app/activity"
                title={t(locale, "Floor activity")}
                detail={t(locale, "What everyone has been doing, by day")}
              />
              <ProfileLink
                href="/app/notifications"
                title={t(locale, "Notifications")}
                detail={t(locale, "Dispatches, edits and announcements")}
              />
              <ProfileLink
                href="/app/profile/settings"
                title={t(locale, "Personal details")}
                detail={t(locale, "Photo, name, phone and password")}
              />
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function Tile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <p className="mt-2 font-display text-2xl font-bold leading-none tabular">
        {value}
      </p>
      <p className="mt-1.5 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function ProfileLink({
  href,
  title,
  detail,
}: {
  href: string;
  title: string;
  detail: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-accent"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}
