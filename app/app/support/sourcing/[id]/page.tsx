import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, User } from "lucide-react";

import { PageHeader } from "@/components/app/page-header";
import { SourcingWorkflow } from "@/components/app/support-forms";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, toNumber } from "@/lib/format";
import { formatUsd } from "@/lib/fx";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";

export const metadata: Metadata = { title: "Sourcing request" };

const TYPE_LABEL: Record<string, string> = {
  FIND_SUPPLIER: "Find a supplier",
  FIND_PRODUCT: "Find a product",
  REQUEST_QUOTATION: "Request a quotation",
  VERIFY_SUPPLIER: "Verify a supplier",
  BUY_ON_BEHALF: "Buy on the customer's behalf",
};

export default async function SourcingRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission("sourcing.manage");
  const { id } = await params;

  const request = await prisma.sourcingRequest.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, code: true, name: true, phone: true } },
      openedBy: { select: { name: true } },
      assignedTo: { select: { name: true } },
    },
  });

  if (!request) notFound();

  return (
    <>
      <Link
        href="/app/support/sourcing"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        All requests
      </Link>

      <PageHeader
        title={request.product}
        description={`${request.requestNumber} · ${
          TYPE_LABEL[request.type] ?? request.type
        } · opened ${formatDateTime(request.createdAt)}`}
        actions={
          <>
            <Badge variant="outline">{request.priority.toLowerCase()}</Badge>
            <Badge variant="outline">
              {request.status.replace(/_/g, " ").toLowerCase()}
            </Badge>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5 shadow-soft">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              What they asked for
            </h2>
            <p className="mt-3 whitespace-pre-wrap text-sm">{request.description}</p>
            <dl className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-muted-foreground">Category</dt>
                <dd className="mt-0.5 text-sm font-medium">
                  {request.category ?? "Not given"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Budget</dt>
                <dd className="mt-0.5 text-sm font-medium">
                  {request.budgetUsd ? formatUsd(toNumber(request.budgetUsd)) : "Open"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Handled by</dt>
                <dd className="mt-0.5 text-sm font-medium">
                  {request.assignedTo?.name ?? "Unassigned"}
                </dd>
              </div>
            </dl>
          </section>

          {request.findings ? (
            <section className="rounded-xl border border-success/30 bg-success/5 p-5">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-success">
                What we found
              </h2>
              <p className="mt-2 whitespace-pre-wrap text-sm">{request.findings}</p>
            </section>
          ) : null}
        </div>

        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5 shadow-soft">
            <h2 className="mb-3 font-semibold">Customer</h2>
            {request.customer ? (
              <Link
                href={`/app/customers/${request.customer.id}`}
                className="flex items-start gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/40"
              >
                <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="font-medium">{request.customer.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {request.customer.code}
                    {request.customer.phone ? ` · ${request.customer.phone}` : ""}
                  </p>
                </div>
              </Link>
            ) : (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{request.contactName ?? "Unknown"}</p>
                <p className="text-xs text-muted-foreground">
                  {request.contactPhone ?? "No number taken"}
                </p>
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              <Link href="/app/support/markets" className="text-brand hover:underline">
                Browse the China markets directory
              </Link>{" "}
              to point them at the right place.
            </p>
          </section>

          <section className="rounded-xl border bg-card p-5 shadow-soft">
            <h2 className="mb-4 font-semibold">Move it forward</h2>
            <SourcingWorkflow
              request={{
                id: request.id,
                status: request.status,
                priority: request.priority,
                findings: request.findings,
              }}
            />
          </section>
        </div>
      </div>
    </>
  );
}
