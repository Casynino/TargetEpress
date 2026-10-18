import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";

import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS } from "@/lib/constants";
import { formatTanzania } from "@/lib/developer-shared";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Audit trail") };
}

const PAGE_SIZE = 50;
const show = (v: unknown) => (v === undefined || v === null ? "" : typeof v === "string" ? v : JSON.stringify(v));

/**
 * The audit trail with the fields the owner asked for: who and what kind of
 * account, what, which record, before and after, why, outcome, and the time in
 * Tanzania. Read-only — nothing on this page edits or deletes a row.
 */
export default async function DeveloperAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ who?: string; outcome?: string; q?: string; page?: string }>;
}) {
  await requirePermission("developer.access");
  const locale = await viewerLocale();
  const { who, outcome, q, page } = await searchParams;
  const current = Math.max(1, Number(page ?? "1") || 1);

  const and: Prisma.AuditLogWhereInput[] = [];
  if (who === "developer") {
    and.push({ OR: [{ actorRole: "DEVELOPER" }, { action: { startsWith: "developer." } }] });
  } else if (who === "staff") {
    and.push({ OR: [{ actorRole: null }, { actorRole: { not: "DEVELOPER" } }] });
    and.push({ NOT: { action: { startsWith: "developer." } } });
  }
  if (outcome === "failure") and.push({ metadata: { path: ["outcome"], equals: "failure" } });
  if (q?.trim()) {
    and.push({
      OR: [
        { summary: { contains: q.trim(), mode: "insensitive" } },
        { action: { contains: q.trim(), mode: "insensitive" } },
        { entityId: { contains: q.trim(), mode: "insensitive" } },
      ],
    });
  }
  const where: Prisma.AuditLogWhereInput = and.length ? { AND: and } : {};

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (current - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const link = (p: number) =>
    `/app/developer/audit?${new URLSearchParams({ ...(who ? { who } : {}), ...(outcome ? { outcome } : {}), ...(q ? { q } : {}), page: String(p) })}`;

  return (
    <>
      <PageHeader
        title={t(locale, "Audit trail")}
        description={t(locale, "Every recorded action. Read-only: nothing here can be edited or deleted.")}
      />
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <select name="who" defaultValue={who ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">{t(locale, "Everyone")}</option>
          <option value="developer">{t(locale, "Developer only")}</option>
          <option value="staff">{t(locale, "Staff only")}</option>
        </select>
        <select name="outcome" defaultValue={outcome ?? ""} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">{t(locale, "Any outcome")}</option>
          <option value="failure">{t(locale, "Failures only")}</option>
        </select>
        <input name="q" defaultValue={q ?? ""} placeholder={t(locale, "Search")} className="h-9 rounded-md border bg-background px-2 text-sm" />
        <button className="h-9 rounded-md border px-3 text-sm">{t(locale, "Filter")}</button>
      </form>
      <div className="overflow-x-auto rounded-xl border bg-card shadow-soft">
        <table className="w-full min-w-[60rem] text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {["Time", "Who", "Action", "Record", "Before → After", "Reason", "Outcome"].map((h) => (
                <th key={h} className="p-3 font-medium">{t(locale, h)}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y align-top">
            {entries.map((e) => {
              const m = (e.metadata && typeof e.metadata === "object" && !Array.isArray(e.metadata) ? e.metadata : {}) as Record<string, unknown>;
              const failed = m.outcome === "failure";
              return (
                <tr key={e.id}>
                  <td className="whitespace-nowrap p-3 font-mono text-xs tabular-nums">{formatTanzania(e.createdAt)}</td>
                  <td className="p-3">
                    {e.actor?.name ?? t(locale, "Unknown")}
                    {e.actorRole ? (
                      <Badge variant={e.actorRole === "DEVELOPER" ? "brand" : "outline"} className="ml-2">
                        {t(locale, ROLE_LABELS[e.actorRole])}
                      </Badge>
                    ) : null}
                  </td>
                  <td className="p-3"><span className="font-mono text-xs">{e.action}</span><br />{e.summary}</td>
                  <td className="p-3 font-mono text-xs">{e.entity}<br />{e.entityId ?? ""}</td>
                  <td className="p-3 font-mono text-xs">{show(m.before)}{m.before !== undefined || m.after !== undefined ? " → " : ""}{show(m.after)}</td>
                  <td className="p-3 text-xs">{show(m.reason)}</td>
                  <td className="p-3">{failed ? <Badge variant="destructive">{t(locale, "failed")}</Badge> : <Badge variant="muted">{t(locale, "ok")}</Badge>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pages > 1 ? (
        <p className="mt-4 flex items-center justify-between text-sm">
          {current > 1 ? <a className="text-brand" href={link(current - 1)}>← {t(locale, "Newer")}</a> : <span />}
          <span className="text-muted-foreground">{current} / {pages}</span>
          {current < pages ? <a className="text-brand" href={link(current + 1)}>{t(locale, "Older")} →</a> : <span />}
        </p>
      ) : null}
    </>
  );
}
