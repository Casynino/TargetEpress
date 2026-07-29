import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { History } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { ROLE_LABELS } from "@/lib/constants";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Audit log" };

const PAGE_SIZE = 60;

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entity?: string; page?: string }>;
}) {
  await requirePermission("audit.view");
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
        title="Audit log"
        description="Append-only. Every privileged action, who did it, and when."
      />

      <form className="mb-4 flex flex-col gap-2 sm:flex-row" action="/app/admin/audit">
        <Input
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search summary, action or user"
          className="flex-1"
        />
        <NativeSelect name="entity" defaultValue={entity ?? ""} className="sm:w-52">
          <option value="">All records</option>
          <option value="Shipment">Shipments</option>
          <option value="Batch">Batches</option>
          <option value="Invoice">Invoices</option>
          <option value="Payment">Payments</option>
          <option value="PickupNote">Pickup notes</option>
          <option value="User">Staff</option>
        </NativeSelect>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>

      {entries.length === 0 ? (
        <EmptyState icon={History} title="Nothing logged yet" />
      ) : (
        <ul className="divide-y rounded-xl border bg-card shadow-soft">
          {entries.map((entry) => (
            <li key={entry.id} className="px-5 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm">{entry.summary}</p>
                <span className="font-mono text-xs text-muted-foreground tabular">
                  {formatDateTime(entry.createdAt)}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                <span className="code-chip mr-2">{entry.action}</span>
                {entry.actor?.name ?? entry.actorEmail ?? "System"}
                {entry.actorRole ? ` · ${ROLE_LABELS[entry.actorRole]}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {currentPage} of {pages} · {total.toLocaleString()} entries
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
                  Previous
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
                  Next
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
