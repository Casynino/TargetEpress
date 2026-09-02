import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileText, Paperclip } from "lucide-react";

import { CollectionsNav } from "@/components/app/collections-nav";
import { FinanceNav } from "@/components/app/finance-nav";
import { financeTabs } from "@/lib/finance-tabs";
import { EmptyState } from "@/components/app/empty-state";
import { IconHint } from "@/components/app/icon-hint";
import { PageHeader } from "@/components/app/page-header";
import { SearchBox } from "@/components/app/search-box";
import { SubmissionCorrection } from "@/components/app/submission-correction";
import { Badge } from "@/components/ui/badge";
import { submissionQueue } from "@/lib/collections";
import { SUBMISSION_STATUS_LABELS } from "@/lib/constants";
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
  /* Separate from "Sent back" on purpose: Finance refusing a claim and this desk
     taking its own back are different facts about a customer. */
  { key: "WITHDRAWN", label: "Withdrawn" },
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
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const user = await requirePermission("collections.view");
  /* The desk that raises a claim may fix it or take it back while it is still
     only a claim. Same permission that created it — correcting your own typo
     before anybody has acted on it is part of recording it. */
  const canCorrect = can(user.role, "payment.submit");
  const locale = await viewerLocale();
  const { status, q } = await searchParams;
  const query = q?.trim() ?? "";
  const canVerify = can(user.role, "payment.verify");

  const active = FILTERS.find((f) => f.key === status)?.key ?? "PENDING";

  // A verifier asking for the pending list wants the one with the buttons.
  // Same rows, same order — this page is the read-only copy, and offering it to
  // the desk that can act is a dead end dressed as a queue.
  if (canVerify && active === "PENDING") redirect("/app/collections/verify");
  const rows = await submissionQueue(
    active === "ALL"
      ? null
      : (active as "PENDING" | "VERIFIED" | "REJECTED" | "WITHDRAWN")
  );

  /*
    Search the rows on the page, not the database.

    This register is read to settle an argument — "we sent that on the 4th, here
    is the screenshot" — and the way somebody arrives at it is with one fact in
    hand: a customer, a submission number a colleague quoted, the invoice, or the
    tracking number off the box. Matching the rows already fetched keeps that
    honest: what the box can find is exactly what the list can show, and there is
    no second definition of "matches" living in SQL to disagree with it. The
    slice is the same one the page displays, so the box is a shortcut through
    this page rather than an index of every claim ever filed.
  */
  const needle = query.toLowerCase();
  const visible =
    needle.length === 0
      ? rows
      : rows.filter((row) =>
          [
            row.invoice.customer.name,
            row.invoice.customer.phone ?? "",
            row.submissionNumber,
            row.invoice.invoiceNumber,
            row.invoice.shipment.trackingNumber,
            row.reference ?? "",
            row.note ?? "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(needle)
        );

  /* One line per way a person knows a claim — the component de-duplicates by
     value, so a customer who has sent up six payments is one line, not six. */
  const suggestions = rows.flatMap((row) => [
    {
      value: row.invoice.customer.name,
      label: row.invoice.customer.name,
      hint: row.invoice.customer.phone ?? undefined,
    },
    {
      value: row.submissionNumber,
      label: row.invoice.customer.name,
      hint: row.submissionNumber,
    },
    {
      value: row.invoice.invoiceNumber,
      label: row.invoice.customer.name,
      hint: row.invoice.invoiceNumber,
    },
    {
      value: row.invoice.shipment.trackingNumber,
      label: row.invoice.customer.name,
      hint: row.invoice.shipment.trackingNumber,
    },
  ]);

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
      {/*
        The finance tab row stays put.

        Collections is a tab of Finance AND a workspace of its own, so opening
        it used to swap the whole tab row out — and getting back to the ledger
        or the overview meant going down to the sidebar. The owner called that
        inconvenient and he is right: a tab that removes its own tab bar leaves
        the reader with nowhere to go but back.

        Two rows, but hierarchical rather than identical: where you are in
        Finance, then where you are inside Collections. Only shown to a reader
        who has the finance tabs at all — Support shares this workspace and
        must not be given doors it cannot open.
      */}
      {can(user.role, "accounting.view") ? (
        <FinanceNav tabs={financeTabs(user.role)} />
      ) : null}

      <CollectionsNav status={active} canVerify={canVerify} />

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.filter((f) => !(canVerify && f.key === "PENDING")).map((filter) => (
          <Link
            key={filter.key}
            /* The chips keep the search and the search keeps the chip, so
               neither control silently undoes the other. */
            href={`/app/collections/submissions?status=${filter.key}${
              query ? `&q=${encodeURIComponent(query)}` : ""
            }`}
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

      {/*
        Search that shows what it can find while you type.

        Somebody opens this register holding one fact — a name, a submission
        number read off a WhatsApp message, an invoice, a tracking number — and
        typing it blind is a guess they only score after the page reloads. The
        suggestions are these rows, so picking a name is recognising it rather
        than spelling it, and the list underneath can never disagree with what
        the box offered.
      */}
      <div className="mb-4">
        <SearchBox
          className="max-w-xl"
          defaultValue={query}
          placeholder={t(
            locale,
            "Customer, submission, invoice or tracking number…"
          )}
          suggestions={suggestions}
        >
          <input type="hidden" name="status" value={active} />
        </SearchBox>
        {query ? (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {visible.length} {t(locale, "of")} {rows.length} {t(locale, "match")}
            {" · "}
            <Link
              href={`/app/collections/submissions?status=${active}`}
              className="underline-offset-2 hover:underline"
            >
              {t(locale, "Clear")}
            </Link>
          </p>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState
          title={
            query
              ? `${t(locale, "Nothing matches")} “${query}”`
              : t(locale, "Nothing here")
          }
          description={
            query
              ? t(locale, "Try the customer's name, or a shorter search.")
              : t(locale, "No submission matches that filter.")
          }
        />
      ) : (
        /*
          A register, not a stack of cards.

          Each submission was a panel of its own with a bordered header, a
          right-hand money block and a second row underneath for the outcome and
          the evidence — about 140px for three facts. Twenty of them was a
          morning of scrolling on a desk that handles this all day.

          One row each now, inside one panel: who and how much on the first line,
          the paper trail and the decision on the second, evidence as an icon.
          Same facts, a third of the height, and the amounts line up down the
          right edge where they can be compared at a glance.
        */
        <ul className="panel divide-y overflow-hidden">
          {visible.map((row) => (
            <li
              key={row.id}
              id={row.submissionNumber}
              className="scroll-mt-6 px-4 py-2.5 transition-colors hover:bg-accent/30"
            >
              <div className="flex items-baseline justify-between gap-3">
                <p className="flex min-w-0 items-baseline gap-2 text-sm font-semibold">
                  <span className="truncate">{row.invoice.customer.name}</span>
                  {/* A word, not a pill: at this density a bordered badge on
                      every row is twenty boxes competing with the money. */}
                  <span
                    className={`shrink-0 text-[11px] font-medium ${
                      row.status === "VERIFIED"
                        ? "text-success"
                        : row.status === "REJECTED"
                          ? "text-destructive"
                          : "text-warning"
                    }`}
                  >
                    {t(locale, SUBMISSION_STATUS_LABELS[row.status])}
                  </span>
                </p>
                <p className="shrink-0 font-display text-sm font-bold tabular">
                  {formatMoney(toNumber(row.amount), row.currency)}
                </p>
              </div>

              <div className="mt-0.5 flex items-baseline justify-between gap-3 text-[11px] text-muted-foreground">
                <p className="min-w-0 truncate">
                  <span className="font-mono">
                    {row.submissionNumber} · {row.invoice.invoiceNumber} ·{" "}
                    {row.invoice.shipment.trackingNumber}
                    {row.reference ? ` · ${row.reference}` : ""}
                  </span>
                  {row.status === "VERIFIED" ? (
                    <span className="text-success">
                      {" "}
                      · {t(locale, "verified by")}{" "}
                      {row.reviewedBy?.name ?? t(locale, "Finance")}
                      {row.payment?.receipt
                        ? ` · ${row.payment.receipt.receiptNumber}`
                        : ""}
                    </span>
                  ) : null}
                  {row.status === "REJECTED" ? (
                    <span className="text-destructive">
                      {" "}
                      · {t(locale, "sent back")}
                      {row.rejectionReason ? `: ${row.rejectionReason}` : ""}
                    </span>
                  ) : null}
                  {row.status === "WITHDRAWN" ? (
                    <span className="text-muted-foreground">
                      {" "}
                      · {t(locale, "withdrawn by us")}
                      {row.rejectionReason ? `: ${row.rejectionReason}` : ""}
                    </span>
                  ) : null}
                  {row.note ? ` · ${row.note}` : ""}
                </p>

                <span className="flex shrink-0 flex-wrap items-center gap-2">
                  <span className="tabular">
                    {row.submittedBy?.name ?? "—"} ·{" "}
                    {formatDateTime(row.submittedAt, locale)}
                  </span>
                  {/* Fix it or take it back, while it is still only a claim. */}
                  {canCorrect ? (
                    <SubmissionCorrection
                      submissionId={row.id}
                      invoiceId={row.invoice.id}
                      amount={toNumber(row.amount)}
                      reference={row.reference}
                      note={row.note}
                      status={row.status}
                    />
                  ) : null}
                  {/* The evidence stays one click away — it is the whole point of
                      the record — but as an icon, since the filename told the
                      reader nothing they needed at this density. */}
                  {row.proofs.map((proof) => (
                    <IconHint key={proof.id} label={t(locale, "Open the proof")}>
                      <a
                        href={proof.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`${t(locale, "Proof")} · ${proof.filename ?? row.submissionNumber}`}
                        className="focus-ring rounded p-0.5 transition-colors hover:text-brand"
                      >
                        {proof.contentType.startsWith("image/") ? (
                          <Paperclip className="h-3.5 w-3.5" />
                        ) : (
                          <FileText className="h-3.5 w-3.5" />
                        )}
                      </a>
                    </IconHint>
                  ))}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
