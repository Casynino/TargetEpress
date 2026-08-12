import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileText, Paperclip } from "lucide-react";

import { CollectionsNav } from "@/components/app/collections-nav";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { Badge } from "@/components/ui/badge";
import { submissionQueue } from "@/lib/collections";
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

export const metadata: Metadata = { title: "Submissions" };

const FILTERS = [
  { key: "PENDING", label: "With Finance" },
  { key: "VERIFIED", label: "Verified" },
  { key: "REJECTED", label: "Sent back" },
  { key: "ALL", label: "Everything" },
] as const;

/**
 * The desk's own collection history.
 *
 * Not an accounting ledger — a record of what this desk handed up and what came
 * of it. Every row carries the evidence that went with it, so an argument four
 * months from now is settled by opening the screenshot rather than by
 * remembering.
 */
export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const user = await requirePermission("collections.view");
  const locale = await viewerLocale();
  const { status } = await searchParams;
  const canVerify = can(user.role, "payment.verify");

  const active = FILTERS.find((f) => f.key === status)?.key ?? "PENDING";

  // A verifier asking for the pending list wants the one with the buttons.
  // Same rows, same order — this page is the read-only copy, and offering it to
  // the desk that can act is a dead end dressed as a queue.
  if (canVerify && active === "PENDING") redirect("/app/collections/verify");
  const rows = await submissionQueue(
    active === "ALL" ? null : (active as "PENDING" | "VERIFIED" | "REJECTED")
  );

  return (
    <>
      <PageHeader
        title={t(locale, "Collection history")}
        description={
          canVerify
            ? t(
                locale,
                "What Customer Support has handed up, and what was decided. The customer's evidence stays attached to every one."
              )
            : t(
                locale,
                "What this desk has handed to Finance, and what they decided. The customer's evidence stays attached to every one."
              )
        }
      />

      <CollectionsNav status={active} canVerify={canVerify} />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.filter((f) => !(canVerify && f.key === "PENDING")).map((filter) => (
          <Link
            key={filter.key}
            href={`/app/collections/submissions?status=${filter.key}`}
            className={`focus-ring rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              active === filter.key
                ? "border-brand bg-brand text-brand-foreground"
                : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
            }`}
          >
            {t(locale, filter.label)}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={t(locale, "Nothing here")}
          description={t(locale, "No submission matches that filter.")}
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              id={row.submissionNumber}
              className="panel overflow-hidden scroll-mt-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-3.5">
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {row.invoice.customer.name}
                    <Badge
                      variant="outline"
                      className={
                        row.status === "VERIFIED"
                          ? "border-success/40 font-normal text-success"
                          : row.status === "REJECTED"
                            ? "border-destructive/40 font-normal text-destructive"
                            : "border-warning/40 font-normal text-warning"
                      }
                    >
                      {row.status === "PENDING"
                        ? t(locale, "pending Finance verification")
                        : t(locale, row.status.toLowerCase())}
                    </Badge>
                  </p>
                  <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                    {row.submissionNumber} · {row.invoice.invoiceNumber} ·{" "}
                    {row.invoice.shipment.trackingNumber}
                    {row.reference ? ` · ${row.reference}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-display text-lg font-bold leading-none tabular">
                    {formatMoney(toNumber(row.amount), row.currency)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {row.submittedBy?.name ?? "—"} ·{" "}
                    {formatDateTime(row.submittedAt, locale)}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 px-5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-1.5 text-xs">
                  {row.status === "VERIFIED" ? (
                    <p className="text-success">
                      {t(locale, "Verified by")}{" "}
                      {row.reviewedBy?.name ?? t(locale, "Finance")}
                      {row.reviewedAt
                        ? ` ${t(locale, "on")} ${formatDateTime(row.reviewedAt, locale)}`
                        : ""}
                      {row.payment?.receipt
                        ? ` — ${t(locale, "receipt")} ${row.payment.receipt.receiptNumber}`
                        : ""}
                      .
                    </p>
                  ) : null}
                  {row.status === "REJECTED" ? (
                    <p className="text-destructive">
                      {t(locale, "Sent back by")}{" "}
                      {row.reviewedBy?.name ?? t(locale, "Finance")}:{" "}
                      {row.rejectionReason ?? t(locale, "no reason recorded")}
                    </p>
                  ) : null}
                  {row.status === "PENDING" ? (
                    <p className="text-muted-foreground">
                      {t(
                        locale,
                        "Waiting on Finance. Nothing is settled and no pickup note exists until they agree."
                      )}
                    </p>
                  ) : null}
                  {row.note ? (
                    <p className="text-muted-foreground">{row.note}</p>
                  ) : null}
                </div>

                {/* The evidence, always reachable. This is the point of the
                    record — a typed reference proves nothing on its own. */}
                <ul className="flex flex-wrap gap-2">
                  {row.proofs.length === 0 ? (
                    <li className="text-xs text-muted-foreground">
                      {t(locale, "no evidence attached")}
                    </li>
                  ) : (
                    row.proofs.map((proof) => (
                      <li key={proof.id}>
                        <a
                          href={proof.url}
                          target="_blank"
                          rel="noreferrer"
                          className="focus-ring inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors hover:border-brand/40 hover:text-brand"
                        >
                          {proof.contentType.startsWith("image/") ? (
                            <Paperclip className="h-3 w-3" />
                          ) : (
                            <FileText className="h-3 w-3" />
                          )}
                          {proof.filename ?? t(locale, "Proof")}
                        </a>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
