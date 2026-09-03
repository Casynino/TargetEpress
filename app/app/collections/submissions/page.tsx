import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { FileText, Paperclip } from "lucide-react";

import { CollectionsNav } from "@/components/app/collections-nav";
import { FinanceNav } from "@/components/app/finance-nav";
import { financeTabs } from "@/lib/finance-tabs";
import { EmptyState } from "@/components/app/empty-state";
import { PageHeader } from "@/components/app/page-header";
import { SearchBox } from "@/components/app/search-box";
import { SubmissionCorrection } from "@/components/app/submission-correction";
import { Badge } from "@/components/ui/badge";
import { submissionQueue } from "@/lib/collections";
import { PAYMENT_METHOD_LABELS, SUBMISSION_STATUS_LABELS } from "@/lib/constants";
import { currentRateValue } from "@/lib/fx";
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { formatLocal, formatUsd } from "@/lib/money";
import { sumShillings, sumUsd, type MoneyRow } from "@/lib/money-totals";
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
  const [rows, rate] = await Promise.all([
    submissionQueue(
      active === "ALL"
        ? null
        : (active as "PENDING" | "VERIFIED" | "REJECTED" | "WITHDRAWN")
    ),
    currentRateValue(),
  ]);

  /*
    What this view adds up to, headline first.

    A submission has no amountUsd snapshot the way a Payment does — it is
    still a claim, not money that has actually moved through an account — so
    the dollar side is worked out live at today's rate rather than read from
    a frozen column. Good enough for "how much is sitting with Finance right
    now"; the invoice itself is the source of truth once a claim is verified.
  */
  const moneyRows: MoneyRow[] = rows.map((row) => ({
    currency: row.currency,
    amount: row.amount,
    amountUsd:
      row.currency === "USD"
        ? row.amount
        : rate
          ? toNumber(row.amount) / rate
          : 0,
  }));
  const totalShillings = sumShillings(moneyRows, rate);
  const totalUsd = sumUsd(moneyRows, rate);

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

      {/*
        The headline figure, not just a queue of rows to add up by eye.

        Every other register in this app opens with what it comes to before
        it shows the lines that make it up — the ledger, the expenses list,
        the credit book. This one opened straight into rows and made the
        desk that raised them do the arithmetic themselves to answer "how
        much have I sent up that Finance hasn't dealt with yet".
      */}
      <div className="mb-4 rounded-xl border bg-card p-4 shadow-soft sm:w-fit">
        <p
          className={`text-xs font-semibold uppercase tracking-widest ${
            active === "VERIFIED"
              ? "text-success"
              : active === "REJECTED"
                ? "text-destructive"
                : active === "WITHDRAWN"
                  ? "text-muted-foreground"
                  : "text-warning"
          }`}
        >
          {rows.length} {t(locale, FILTERS.find((f) => f.key === active)?.label ?? "")}
        </p>
        <p className="font-display text-2xl font-bold tabular-nums">
          {formatLocal(totalShillings)}
        </p>
        <p className="font-mono text-xs text-muted-foreground">
          {formatUsd(totalUsd)}
          {active === "PENDING"
            ? ` · ${t(locale, "sitting with Finance, waiting on a decision")}`
            : ""}
        </p>
      </div>

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
          One card per claim, reading the way the Verify queue does.

          Finance's own copy of this exact list — reference, method, who sent
          it and when, the evidence, the decision — turned out to be the
          right shape for this page too: this desk raises exactly what that
          one settles, so the two should read as the same fact told from
          either side, not as a dense line here and a full card there.
        */
        <ul className="space-y-3">
          {visible.map((row) => {
            const outstanding =
              toNumber(row.invoice.total) - toNumber(row.invoice.amountPaid);
            return (
              <li
                key={row.id}
                id={row.submissionNumber}
                className="panel scroll-mt-24 overflow-hidden"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {row.invoice.customer.name}
                      <Badge
                        variant="outline"
                        className={`font-normal ${
                          row.status === "VERIFIED"
                            ? "border-success/40 text-success"
                            : row.status === "REJECTED"
                              ? "border-destructive/40 text-destructive"
                              : row.status === "WITHDRAWN"
                                ? "text-muted-foreground"
                                : "border-warning/40 text-warning"
                        }`}
                      >
                        {t(locale, SUBMISSION_STATUS_LABELS[row.status])}
                      </Badge>
                    </p>
                    <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                      {row.submissionNumber} ·{" "}
                      <Link
                        href={`/app/cargo/${row.invoice.shipment.trackingNumber}`}
                        className="hover:text-brand"
                      >
                        {row.invoice.shipment.trackingNumber}
                      </Link>{" "}
                      · {row.invoice.invoiceNumber}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-xl font-bold leading-none tabular">
                      {formatMoney(toNumber(row.amount), row.currency)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t(locale, "owed")}{" "}
                      {formatMoney(outstanding, row.invoice.currency)}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="space-y-2">
                    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-3">
                      {[
                        {
                          label: t(locale, "Reference"),
                          value: row.reference ?? t(locale, "none given"),
                        },
                        {
                          label: t(locale, "Method"),
                          value: t(locale, PAYMENT_METHOD_LABELS[row.method]),
                        },
                        {
                          label: t(locale, "Submitted"),
                          value: `${row.submittedBy?.name ?? "—"} · ${formatDateTime(row.submittedAt, locale)}`,
                        },
                      ].map((fact) => (
                        <div key={fact.label}>
                          <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                            {fact.label}
                          </dt>
                          <dd className="mt-0.5 text-sm font-medium">
                            {fact.value}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    {/* What became of it, once Finance has actually looked —
                        a second fact line rather than a colour Support has to
                        already know how to read. */}
                    {row.status === "VERIFIED" ? (
                      <p className="text-xs text-success">
                        {t(locale, "Verified by")}{" "}
                        {row.reviewedBy?.name ?? t(locale, "Finance")}
                        {row.reviewedAt
                          ? ` · ${formatDateTime(row.reviewedAt, locale)}`
                          : ""}
                        {row.payment?.receipt
                          ? ` · ${row.payment.receipt.receiptNumber}`
                          : ""}
                      </p>
                    ) : null}
                    {row.status === "REJECTED" ? (
                      <p className="text-xs text-destructive">
                        {t(locale, "Sent back by")}{" "}
                        {row.reviewedBy?.name ?? t(locale, "Finance")}
                        {row.reviewedAt
                          ? ` · ${formatDateTime(row.reviewedAt, locale)}`
                          : ""}
                        {row.rejectionReason ? `: ${row.rejectionReason}` : ""}
                      </p>
                    ) : null}
                    {row.status === "WITHDRAWN" ? (
                      <p className="text-xs text-muted-foreground">
                        {t(locale, "Withdrawn by us")}
                        {row.reviewedAt
                          ? ` · ${formatDateTime(row.reviewedAt, locale)}`
                          : ""}
                        {row.rejectionReason ? `: ${row.rejectionReason}` : ""}
                      </p>
                    ) : null}
                    {row.note ? (
                      <p className="text-xs text-muted-foreground">{row.note}</p>
                    ) : null}

                    <ul className="flex flex-wrap gap-2 pt-1">
                      {row.proofs.length === 0 ? (
                        <li className="text-xs text-muted-foreground">
                          {t(locale, "nothing attached")}
                        </li>
                      ) : (
                        row.proofs.map((proof) => (
                          <li key={proof.id}>
                            <a
                              href={proof.url}
                              target="_blank"
                              rel="noreferrer"
                              className="focus-ring inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-brand/40 hover:text-brand"
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

                  {/* Fix it or take it back, while it is still only a claim —
                      same corner Finance's own Verify/Send back pair sits in,
                      so the two decisions read as the same kind of act. */}
                  {canCorrect ? (
                    <div className="lg:min-w-[15rem]">
                      <SubmissionCorrection
                        submissionId={row.id}
                        invoiceId={row.invoice.id}
                        amount={toNumber(row.amount)}
                        method={row.method}
                        reference={row.reference}
                        note={row.note}
                        status={row.status}
                      />
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
