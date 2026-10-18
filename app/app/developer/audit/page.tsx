import Link from "next/link";
import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { Activity, ScrollText } from "lucide-react";

import { InfoCallout } from "@/components/developer/info";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ROLE_LABELS } from "@/lib/constants";
import { eat, formatNumber, humanize } from "@/lib/developer/format";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Audit" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const SCOPES = [
  { key: "all", label: "Everything" },
  { key: "developer", label: "Developer actions" },
  { key: "failures", label: "Failures" },
] as const;
type Scope = (typeof SCOPES)[number]["key"];

type Meta = {
  developer?: boolean;
  outcome?: string;
  reason?: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string;
  workingAs?: { id: string; name: string };
};

const show = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));

/**
 * THE PERMANENT DIARY, read-only. Nothing on this page edits or deletes a row,
 * and the database refuses to let anybody do so to a Developer line.
 */
export default async function DeveloperAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ scope?: string; q?: string; from?: string; to?: string; page?: string }>;
}) {
  await requirePermission("developer.access");
  const sp = await searchParams;
  const scope: Scope = SCOPES.some((s) => s.key === sp.scope) ? (sp.scope as Scope) : "all";
  const q = (sp.q ?? "").trim();
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? "") ? sp.from! : "";
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? "") ? sp.to! : "";
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const and: Prisma.AuditLogWhereInput[] = [];
  if (scope === "developer")
    and.push({
      OR: [
        { actorRole: "DEVELOPER" },
        { action: { startsWith: "developer." } },
        { metadata: { path: ["developer"], equals: true } },
      ],
    });
  if (scope === "failures") and.push({ metadata: { path: ["outcome"], equals: "failure" } });
  if (q)
    and.push({
      OR: [
        { summary: { contains: q, mode: "insensitive" } },
        { action: { contains: q, mode: "insensitive" } },
        { entity: { contains: q, mode: "insensitive" } },
        { entityId: { contains: q, mode: "insensitive" } },
        { actorEmail: { contains: q, mode: "insensitive" } },
        { actor: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  /* Dates are Tanzania days: the owner reads this in Dar es Salaam. */
  if (from) and.push({ createdAt: { gte: new Date(`${from}T00:00:00+03:00`) } });
  if (to) and.push({ createdAt: { lt: new Date(new Date(`${to}T00:00:00+03:00`).getTime() + 86_400_000) } });
  const where: Prisma.AuditLogWhereInput = and.length ? { AND: and } : {};

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
      include: { actor: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number, s: Scope = scope) => {
    const u = new URLSearchParams();
    if (s !== "all") u.set("scope", s);
    if (q) u.set("q", q);
    if (from) u.set("from", from);
    if (to) u.set("to", to);
    if (p > 1) u.set("page", String(p));
    const qs = u.toString();
    return `/app/developer/audit${qs ? `?${qs}` : ""}`;
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Audit</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          The permanent diary of the system: who did what, and when. Developer lines can&apos;t be edited or deleted — not
          even from the database.
        </p>
      </div>

      <InfoCallout icon={ScrollText} title="How to read this page">
        Each line is one thing that happened. An <span className="inline-block size-2 rounded-full bg-warning align-middle" />{" "}
        orange dot and a <strong className="text-foreground">Developer</strong> tag mean it was done by you — including
        when you worked as someone. A <span className="inline-block size-2 rounded-full bg-info align-middle" /> blue
        dot is normal staff work, and a <span className="inline-block size-2 rounded-full bg-destructive align-middle" />{" "}
        red dot is something that failed. Use the filters to show only your actions, or only failures. Times are
        Tanzania time.
      </InfoCallout>

      <div className="flex flex-wrap gap-1.5">
        {SCOPES.map((s) => (
          <Link
            key={s.key}
            href={link(1, s.key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              scope === s.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {s.label}
          </Link>
        ))}
      </div>

      <form method="get" className="grid gap-2 sm:grid-cols-[1fr_9rem_9rem_auto]">
        {scope !== "all" && <input type="hidden" name="scope" value={scope} />}
        <Input name="q" defaultValue={q} placeholder="Search who, what or where…" />
        <Input name="from" type="date" defaultValue={from} aria-label="From date" />
        <Input name="to" type="date" defaultValue={to} aria-label="To date" />
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {rows.length === 0 ? (
        <Card>
          <CardContent className="grid place-items-center gap-2 py-12 text-center">
            <Activity className="size-6 text-muted-foreground" />
            <p className="font-medium">Nothing matches</p>
            <p className="text-sm text-muted-foreground">Try a wider date range or a different search.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ol className="divide-y divide-border">
              {rows.map((log) => {
                const m = (log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata)
                  ? log.metadata
                  : {}) as Meta;
                const isDev = log.actorRole === "DEVELOPER" || log.action.startsWith("developer.") || m.developer === true;
                const failed = m.outcome === "failure";
                const hasDetail = m.reason || m.before != null || m.after != null || m.ipAddress;
                const who = log.actor?.name ?? log.actorEmail ?? "System";
                return (
                  <li key={log.id} className="px-5 py-3">
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-1.5 size-2 shrink-0 rounded-full",
                          failed ? "bg-destructive" : isDev ? "bg-warning" : "bg-info"
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">{log.summary}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {who}
                          {m.workingAs ? ` (as ${m.workingAs.name})` : ""} · {eat(log.createdAt)} ·{" "}
                          <span className="font-mono">{log.action}</span>
                        </p>
                        {hasDetail && (
                          <details className="mt-1.5 text-xs">
                            <summary className="cursor-pointer text-primary">Details</summary>
                            <dl className="mt-1.5 grid gap-1 rounded-lg bg-muted/40 p-2.5">
                              {m.reason && (
                                <div>
                                  <dt className="font-medium">Reason</dt>
                                  <dd className="text-muted-foreground">{m.reason}</dd>
                                </div>
                              )}
                              {m.before != null && (
                                <div>
                                  <dt className="font-medium">Before</dt>
                                  <dd className="break-all font-mono text-muted-foreground">{show(m.before)}</dd>
                                </div>
                              )}
                              {m.after != null && (
                                <div>
                                  <dt className="font-medium">After</dt>
                                  <dd className="break-all font-mono text-muted-foreground">{show(m.after)}</dd>
                                </div>
                              )}
                              {m.ipAddress && (
                                <div>
                                  <dt className="font-medium">From</dt>
                                  <dd className="font-mono text-muted-foreground">{m.ipAddress}</dd>
                                </div>
                              )}
                            </dl>
                          </details>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {isDev && <Badge variant="warning">Developer</Badge>}
                        {m.outcome && (
                          <Badge variant={failed ? "destructive" : "success"}>{failed ? "Failed" : "Succeeded"}</Badge>
                        )}
                        {!isDev && log.actorRole && <Badge variant="outline">{ROLE_LABELS[log.actorRole]}</Badge>}
                        <Badge variant="outline">{humanize(log.entity)}</Badge>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {formatNumber(total)} {total === 1 ? "entry" : "entries"} · page {page} of {pages}
        </span>
        <div className="flex gap-2">
          {page > 1 && (
            <Link href={link(page - 1)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
              Newer
            </Link>
          )}
          {page < pages && (
            <Link href={link(page + 1)} className="rounded-lg border border-border px-3 py-1.5 hover:bg-muted">
              Older
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
