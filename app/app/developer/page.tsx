import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, Database, KeyRound, ShieldAlert } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { formatTanzania } from "@/lib/developer-shared";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { systemHealth } from "@/lib/system-health";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Developer dashboard") };
}

/**
 * THE DEVELOPER'S OWN DESK.
 *
 * Opens with what needs attention rather than with a wall of counts: whether
 * the database is up, whether the one migration this account depends on has
 * run, who has been failing to sign in, and what the developer themselves has
 * been refused. The long-form tools — accounts, the audit trail — are one click
 * away, and each of them asks for a reason before it changes anything.
 */
export default async function DeveloperDashboard() {
  const user = await requirePermission("developer.access");
  const locale = await viewerLocale();
  const health = await systemHealth();

  /* Only reached by a Developer, so asking the database for their rows by role
     is safe: the role exists, or this person could not be here. */
  const mine = await prisma.auditLog.findMany({
    where: { actorId: user.id },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, createdAt: true, action: true, summary: true, metadata: true },
  });

  const outcomeOf = (metadata: unknown) =>
    metadata && typeof metadata === "object" && "outcome" in metadata
      ? (metadata as { outcome?: string }).outcome
      : "success";

  const attention = [
    !health.database.reachable
      ? t(locale, "The database is not answering.")
      : null,
    health.database.developerRoleApplied === false
      ? t(locale, "The Developer role has not been added to the database yet.")
      : null,
    health.config.some((c) => !c.set)
      ? t(locale, "Some required configuration is missing.")
      : null,
    health.maintenanceMode ? t(locale, "Maintenance mode is ON — the site is closed.") : null,
    health.security.lockedDeveloperSignIns24h > 0
      ? t(locale, "Developer sign-in was locked after repeated failures in the last 24 hours.")
      : null,
  ].filter((line): line is string => line !== null);

  return (
    <>
      <PageHeader
        title={t(locale, "Developer dashboard")}
        description={t(
          locale,
          "System health, accounts and the audit trail. Everything you do here is recorded under your Developer account."
        )}
      />

      {attention.length === 0 ? (
        <p className="mb-6 flex items-center gap-2 rounded-xl border border-success/30 bg-success/5 p-4 text-sm text-success">
          <CheckCircle2 className="h-4 w-4" />
          {t(locale, "Nothing needs attention right now.")}
        </p>
      ) : (
        <ul className="mb-6 space-y-2 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
          {attention.map((line) => (
            <li key={line} className="flex items-start gap-2 text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {line}
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Health */}
        <section className="rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
            <Database className="h-4 w-4 text-muted-foreground" />
            {t(locale, "System health")}
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row label={t(locale, "Build")} value={health.build.slice(0, 12)} mono />
            <Row label={t(locale, "Environment")} value={health.environment} />
            <Row
              label={t(locale, "Database")}
              value={
                health.database.reachable
                  ? `${t(locale, "reachable")} · ${health.database.latencyMs} ms`
                  : t(locale, "not reachable")
              }
              tone={health.database.reachable ? "ok" : "bad"}
            />
            <Row
              label={t(locale, "Developer role in database")}
              value={
                health.database.developerRoleApplied === null
                  ? t(locale, "unknown")
                  : health.database.developerRoleApplied
                    ? t(locale, "applied")
                    : t(locale, "missing")
              }
              tone={health.database.developerRoleApplied ? "ok" : "bad"}
            />
            <Row
              label={t(locale, "Maintenance mode")}
              value={health.maintenanceMode ? t(locale, "ON") : t(locale, "off")}
              tone={health.maintenanceMode ? "bad" : "ok"}
            />
          </dl>
        </section>

        {/* Configuration — names only, never values. */}
        <section className="rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
            <KeyRound className="h-4 w-4 text-muted-foreground" />
            {t(locale, "Configuration")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t(locale, "Whether each setting exists. Values are never shown.")}
          </p>
          <dl className="mt-3 space-y-2 text-sm">
            {health.config.map((entry) => (
              <Row
                key={entry.name}
                label={entry.name}
                value={entry.set ? t(locale, "set") : t(locale, "missing")}
                tone={entry.set ? "ok" : "bad"}
                mono
              />
            ))}
          </dl>
        </section>

        {/* Security */}
        <section className="rounded-xl border bg-card p-5 shadow-soft">
          <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
            {t(locale, "Security, last 24 hours")}
          </h2>
          <dl className="mt-3 space-y-2 text-sm">
            <Row
              label={t(locale, "Failed sign-ins")}
              value={String(health.security.failedSignIns24h)}
            />
            <Row
              label={t(locale, "Developer sign-in locks")}
              value={String(health.security.lockedDeveloperSignIns24h)}
              tone={health.security.lockedDeveloperSignIns24h ? "bad" : "ok"}
            />
            <Row
              label={t(locale, "Actions you were refused")}
              value={String(health.security.refusedDeveloperActions24h)}
            />
            <Row
              label={t(locale, "Active staff accounts")}
              value={String(health.counts.activeStaff)}
            />
            <Row
              label={t(locale, "Developer accounts")}
              value={
                health.counts.developerAccounts === null
                  ? "—"
                  : String(health.counts.developerAccounts)
              }
            />
          </dl>
        </section>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          [t(locale, "Consignments"), health.counts.shipments],
          [t(locale, "Invoices"), health.counts.invoices],
          [t(locale, "Payments"), health.counts.payments],
          [t(locale, "Audit entries"), health.counts.auditEntries],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border bg-card p-4 shadow-soft">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 font-display text-xl font-bold tabular-nums">
              {Number(value).toLocaleString("en-US")}
            </p>
          </div>
        ))}
      </div>

      {/* The developer's own recent record, so they can see exactly what
          the trail says about them. */}
      <section className="mt-6 rounded-xl border bg-card shadow-soft">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-display text-sm font-semibold">
            {t(locale, "Your recent activity")}
          </h2>
          <Link
            href="/app/developer/audit?who=developer"
            className="text-xs font-medium text-brand hover:underline"
          >
            {t(locale, "Open the audit trail")}
          </Link>
        </div>
        {mine.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            {t(locale, "Nothing recorded yet.")}
          </p>
        ) : (
          <ul className="divide-y">
            {mine.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-sm"
              >
                <span className="min-w-0">
                  <span className="font-medium">{entry.summary}</span>
                  <span className="ml-2 font-mono text-[11px] text-muted-foreground">
                    {entry.action}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {outcomeOf(entry.metadata) === "failure" ? (
                    <Badge variant="destructive">{t(locale, "failed")}</Badge>
                  ) : null}
                  <span className="tabular-nums">{formatTanzania(entry.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function Row({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: "ok" | "bad";
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={
          "text-right font-medium " +
          (mono ? "font-mono text-xs " : "") +
          (tone === "ok" ? "text-success" : tone === "bad" ? "text-destructive" : "")
        }
      >
        {value}
      </dd>
    </div>
  );
}
