import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { FinanceNav } from "@/components/app/finance-nav";
import { Badge } from "@/components/ui/badge";
import { financeTabs } from "@/lib/finance-tabs";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Audit" };

/**
 * Everything money-related that anybody did, and who did it.
 *
 * The same append-only table the CEO's audit log reads, narrowed to the
 * entities that touch money. Narrowed rather than duplicated: there is one
 * record of what happened in this system, and a second one kept separately for
 * Finance would be a second thing that can disagree.
 *
 * No new capture work was needed — every finance action already writes its own
 * audit row inside the transaction that did the work.
 */
const MONEY_ENTITIES = [
  "Invoice",
  "Payment",
  "PickupNote",
  "ExchangeRate",
  "PricingRule",
  "CargoType",
  "Expense",
  "AccountTransfer",
  "CompanyAccount",
  "Compensation",
];

const PAGE_SIZE = 60;

export default async function FinanceAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entity?: string; page?: string }>;
}) {
  const user = await requirePermission("audit.view");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.AuditLogWhereInput = {
    entity: params.entity && MONEY_ENTITIES.includes(params.entity)
      ? params.entity
      : { in: MONEY_ENTITIES },
  };

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { actor: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const linkFor = (entity?: string, nextPage?: number) => {
    const qs = new URLSearchParams();
    if (entity) qs.set("entity", entity);
    if (nextPage && nextPage > 1) qs.set("page", String(nextPage));
    const s = qs.toString();
    return s ? `/app/finance/audit?${s}` : "/app/finance/audit";
  };

  return (
    <>
      <PageHeader
        title="Audit"
        description="Every money action on the system, who did it and when. Append-only — nothing here can be edited or removed, including by the CEO."
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Chip href={linkFor()} active={!params.entity}>
          Everything
        </Chip>
        {MONEY_ENTITIES.map((entity) => (
          <Chip
            key={entity}
            href={linkFor(entity)}
            active={params.entity === entity}
          >
            {entity}
          </Chip>
        ))}
      </div>

      {entries.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          description="Actions appear here as they happen — a price confirmed, a payment taken, a cost paid."
        />
      ) : (
        <div className="rounded-xl border bg-card shadow-soft">
          <ul className="divide-y">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-baseline justify-between gap-3 px-5 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm">{entry.summary}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {entry.actor?.name ?? entry.actorEmail ?? "System"} ·{" "}
                    {formatDateTime(entry.createdAt)}
                  </p>
                </div>
                <Badge variant="outline" className="shrink-0 font-normal">
                  {entry.action}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <p className="text-muted-foreground">
            Page {page} of {pages} · {total} entries
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={linkFor(params.entity, page - 1)}
                className="focus-ring rounded-lg border px-3 py-1.5 hover:bg-accent"
              >
                Previous
              </Link>
            ) : null}
            {page < pages ? (
              <Link
                href={linkFor(params.entity, page + 1)}
                className="focus-ring rounded-lg border px-3 py-1.5 hover:bg-accent"
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`focus-ring rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-brand bg-brand text-brand-foreground"
          : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </Link>
  );
}
