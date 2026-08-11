import type { Metadata } from "next";
import Link from "next/link";

import { PageHeader } from "@/components/app/page-header";
import { NewSourcingForm } from "@/components/app/support-forms";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { toNumber } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export async function generateMetadata(): Promise<Metadata> {
  return { title: t(await viewerLocale(), "Sourcing requests") };
}

const TYPE_LABEL: Record<string, string> = {
  FIND_SUPPLIER: "Find a supplier",
  FIND_PRODUCT: "Find a product",
  REQUEST_QUOTATION: "Quotation",
  VERIFY_SUPPLIER: "Verify a supplier",
  BUY_ON_BEHALF: "Buy on their behalf",
};

const STATUS_TONE: Record<string, string> = {
  NEW: "border-brand/40 text-brand",
  IN_PROGRESS: "border-info/40 text-info",
  WAITING_CUSTOMER: "border-warning/40 text-warning",
  SUPPLIER_FOUND: "border-success/40 text-success",
  COMPLETED: "border-success/40 text-success",
  CANCELLED: "text-muted-foreground",
};

/**
 * The sourcing pipeline, laid out as a board.
 *
 * Sourcing is a pipeline, not a list: a request moves left to right and the
 * useful question is "what is stuck in the middle", which a table hides and
 * columns make obvious.
 */
export default async function SourcingPage() {
  await requirePermission("sourcing.manage");
  const locale = await viewerLocale();

  const [requests, customers] = await Promise.all([
    prisma.sourcingRequest.findMany({
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
      take: 200,
      select: {
        id: true,
        requestNumber: true,
        type: true,
        product: true,
        category: true,
        budgetUsd: true,
        priority: true,
        status: true,
        createdAt: true,
        contactName: true,
        customer: { select: { id: true, name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.customer.findMany({
      orderBy: { name: "asc" },
      take: 500,
      select: { id: true, name: true, phone: true },
    }),
  ]);

  const columns = [
    { key: "NEW", label: "New" },
    { key: "IN_PROGRESS", label: "In progress" },
    { key: "WAITING_CUSTOMER", label: "Waiting for customer" },
    { key: "SUPPLIER_FOUND", label: "Supplier found" },
    { key: "COMPLETED", label: "Completed" },
  ];

  return (
    <>
      <PageHeader
        title={t(locale, "Sourcing requests")}
        description={t(
          locale,
          "Customers who want something found, priced or bought in China."
        )}
      />

      <div className="mb-6">
        <NewSourcingForm customers={customers} />
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {columns.map((column) => {
          const items = requests.filter((request) => request.status === column.key);
          return (
            <section key={column.key} className="rounded-xl border bg-card shadow-soft">
              <header className="flex items-center justify-between gap-2 border-b p-3">
                <h2 className="text-sm font-semibold">{t(locale, column.label)}</h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </header>
              <ul className="divide-y">
                {items.map((request) => (
                  <li key={request.id}>
                    <Link
                      href={`/app/support/sourcing/${request.id}`}
                      className="block p-3 transition-colors hover:bg-accent/40"
                    >
                      <p className="text-sm font-medium">{request.product}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {request.customer?.name ??
                          request.contactName ??
                          t(locale, "Unknown")}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {t(locale, TYPE_LABEL[request.type] ?? request.type)}
                        </Badge>
                        {request.budgetUsd ? (
                          <Badge variant="outline" className="text-[10px]">
                            {formatUsd(toNumber(request.budgetUsd))}
                          </Badge>
                        ) : null}
                        {request.priority === "HIGH" || request.priority === "URGENT" ? (
                          <Badge
                            variant="outline"
                            className="border-warning/40 text-[10px] text-warning"
                          >
                            {t(locale, request.priority.toLowerCase())}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                        {request.requestNumber} · {formatDate(request.createdAt, locale)}
                      </p>
                    </Link>
                  </li>
                ))}
                {items.length === 0 ? (
                  <li className="p-4 text-center text-xs text-muted-foreground">
                    {t(locale, "Empty")}
                  </li>
                ) : null}
              </ul>
            </section>
          );
        })}
      </div>

      {requests.some((r) => r.status === "CANCELLED") ? (
        <p className="mt-4 text-sm text-muted-foreground">
          {requests.filter((r) => r.status === "CANCELLED").length}{" "}
          {t(
            locale,
            "cancelled request(s) are kept out of the board but remain on each customer’s profile."
          )}
        </p>
      ) : null}
    </>
  );
}
