import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { History } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { auditActionLabel, auditSentence } from "@/lib/audit-humanise";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await viewerLocale();
  return { title: t(locale, "Audit log") };
}

const PAGE_SIZE = 60;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entity?: string; page?: string }>;
}) {
  await requirePermission("audit.view");
  const locale = await viewerLocale();
  const { q, entity, page } = await searchParams;

  const currentPage = Math.max(1, Number(page ?? "1") || 1);

  const where: Prisma.AuditLogWhereInput = {
    ...(entity ? { entity } : {}),
    ...(q
      ? {
          OR: [
            { summary: { contains: q.trim(), mode: "insensitive" } },
            { action: { contains: q.trim(), mode: "insensitive" } },
            { actorEmail: { contains: q.trim(), mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (currentPage - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title={t(locale, "Audit log")}
        description={t(
          locale,
          "Append-only. Every privileged action, who did it, and when."
        )}
      />

      <form className="mb-4 flex flex-col gap-2 sm:flex-row" action="/app/admin/audit">
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder={t(locale, "Search summary, action or user")}
          className="flex-1"
        />
        <NativeSelect name="entity" defaultValue={entity ?? ""} className="sm:w-52">
          <option value="">{t(locale, "All records")}</option>
          <option value="Shipment">{t(locale, "Cargo")}</option>
          <option value="Batch">{t(locale, "Batches")}</option>
          <option value="Invoice">{t(locale, "Invoices")}</option>
          <option value="Payment">{t(locale, "Payments")}</option>
          <option value="PickupNote">{t(locale, "Pickup notes")}</option>
          <option value="User">{t(locale, "Staff")}</option>
        </NativeSelect>
        <Button type="submit" variant="outline">
          {t(locale, "Filter")}
        </Button>
      </form>

      {entries.length === 0 ? (
        <EmptyState icon={History} title={t(locale, "Nothing logged yet")} />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-soft">
          {entries.map((entry) => (
            <li key={entry.id} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm">{auditSentence(locale, entry)}</p>
                <span className="font-mono text-xs text-muted-foreground tabular">
                  {formatDateTime(entry.createdAt, locale)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {/* The event, named. Its raw code stays on hover, for whoever
                    wants to paste it into the search box above. */}
                <span
                  title={entry.action}
                  className="mr-2 inline-flex items-center rounded-md border bg-muted/60 px-2 py-0.5 text-xs"
                >
                  {auditActionLabel(locale, entry.action)}
                </span>
                {entry.actor?.name ?? entry.actorEmail ?? t(locale, "System")}
                {entry.actorRole
                  ? ` · ${t(locale, ROLE_LABELS[entry.actorRole])}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {t(locale, "Page")} {currentPage} {t(locale, "of")} {pages} ·{" "}
            {total.toLocaleString()} {t(locale, "entries")}
          </span>
          <div className="flex gap-2">
            {currentPage > 1 ? (
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/app/admin/audit?${new URLSearchParams({
                    ...(q ? { q } : {}),
                    ...(entity ? { entity } : {}),
                    page: String(currentPage - 1),
                  })}`}
                >
                  {t(locale, "Previous")}
                </a>
              </Button>
            ) : null}
            {currentPage < pages ? (
              <Button asChild variant="outline" size="sm">
                <a
                  href={`/app/admin/audit?${new URLSearchParams({
                    ...(q ? { q } : {}),
                    ...(entity ? { entity } : {}),
                    page: String(currentPage + 1),
                  })}`}
                >
                  {t(locale, "Next")}
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
