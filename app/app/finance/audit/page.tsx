import type { Metadata } from "next";
import Link from "next/link";
import type { Prisma } from "@prisma/client";

import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { FinanceNav } from "@/components/app/finance-nav";
import { Badge } from "@/components/ui/badge";
import { auditSentence } from "@/lib/audit-humanise";
import { financeTabs } from "@/lib/finance-tabs";
import { formatDateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await viewerLocale();
  return { title: t(locale, "Audit") };
}

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
  searchParams: Promise<{ entity?: string; page?: string; view?: string }>;
}) {
  const user = await requirePermission("audit.view");
  const locale = await viewerLocale();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  /*
    "Show me what was deleted, and who did it."

    Mistakes get corrected all day — a payment cancelled, a cost voided, a
    consignment deleted, a credit refused after being granted. Each of those
    already writes its own audit row inside the transaction that did the work, so
    the deleted history was in here the whole time; what was missing was a way to
    ask for only it, without reading past a hundred ordinary rows first.

    Every action whose meaning is "this record no longer stands". Kept as one
    explicit list rather than a pattern match on the word "delete", because
    `expense.void`, `payment.void`, `ledger.cancel` and `credit.rejected` all
    mean it without containing the word — and a filter that silently misses one
    is worse than no filter, since it reads as proof nothing happened.
  */
  const UNDONE_ACTIONS = [
    "payment.void",
    "payment.restore",
    "expense.void",
    "expense.reverse",
    "ledger.cancel",
    "cargo.delete",
    "cargo.restore",
    "cargo.purge",
    "shipment.cancel",
    "pickupNote.cancel",
    "credit.rejected",
    "credit.facility.withdrawn",
    "storage.waived",
    "submission.rejected",
  ];
  const undoneOnly = params.view === "undone";

  const where: Prisma.AuditLogWhereInput = {
    entity: params.entity && MONEY_ENTITIES.includes(params.entity)
      ? params.entity
      : { in: MONEY_ENTITIES },
    ...(undoneOnly ? { action: { in: UNDONE_ACTIONS } } : {}),
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
  const linkFor = (entity?: string, nextPage?: number, view = params.view) => {
    const qs = new URLSearchParams();
    if (entity) qs.set("entity", entity);
    if (view) qs.set("view", view);
    if (nextPage && nextPage > 1) qs.set("page", String(nextPage));
    const s = qs.toString();
    return s ? `/app/finance/audit?${s}` : "/app/finance/audit";
  };

  return (
    <>
      <PageHeader
        title={t(locale, "Audit")}
        description={t(
          locale,
          "Every money action on the system, who did it and when. Append-only — nothing here can be edited or removed, including by the CEO."
        )}
      />

      <FinanceNav tabs={financeTabs(user.role)} />

      <div className="mb-4 flex flex-wrap gap-1.5">
        <Chip href={linkFor(undefined, undefined, undefined)} active={!params.entity && !undoneOnly}>
          {t(locale, "Everything")}
        </Chip>
        {/* The deleted history, in one press. Separated from the entity chips by
            a gap because it asks a different question: those ask "what kind of
            record", this asks "what was taken back". */}
        <Chip href={linkFor(params.entity, undefined, "undone")} active={undoneOnly}>
          {t(locale, "Cancelled & deleted")}
        </Chip>
        <span className="w-2" aria-hidden="true" />
        {MONEY_ENTITIES.map((entity) => (
          <Chip
            key={entity}
            href={linkFor(entity)}
            active={params.entity === entity}
          >
            {t(locale, entity)}
          </Chip>
        ))}
      </div>

      {undoneOnly ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {t(
            locale,
            "Everything that was cancelled, voided, refused or deleted — with the name of whoever did it and the reason they gave. Nothing here was removed from the system; each of these is a record that still exists and no longer counts."
          )}
        </p>
      ) : null}

      {entries.length === 0 ? (
        <EmptyState
          title={t(locale, "Nothing recorded yet")}
          description={t(
            locale,
            "Actions appear here as they happen — a price confirmed, a payment taken, a cost paid."
          )}
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
                  <p className="text-sm">{auditSentence(locale, entry)}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {entry.actor?.name ?? entry.actorEmail ?? t(locale, "System")} ·{" "}
                    {formatDateTime(entry.createdAt, locale)}
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
            {t(locale, "Page")} {page} {t(locale, "of")} {pages} · {total}{" "}
            {t(locale, "entries")}
          </p>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={linkFor(params.entity, page - 1)}
                className="focus-ring rounded-lg border px-3 py-1.5 hover:bg-accent"
              >
                {t(locale, "Previous")}
              </Link>
            ) : null}
            {page < pages ? (
              <Link
                href={linkFor(params.entity, page + 1)}
                className="focus-ring rounded-lg border px-3 py-1.5 hover:bg-accent"
              >
                {t(locale, "Next")}
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
