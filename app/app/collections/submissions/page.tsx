import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Paperclip } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { SearchBox } from "@/components/app/search-box";
import { SubmissionCorrection } from "@/components/app/submission-correction";
import {
  BulkSelect,
  BulkBar,
  RowTick,
  SelectAllTick,
} from "@/components/app/bulk-select";
import { withdrawSubmissions } from "@/lib/actions/submission-bulk";
import { submissionQueue } from "@/lib/collections";
import { SUBMISSION_STATUS_LABELS } from "@/lib/constants";
import { currentRateValue } from "@/lib/fx";
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { formatLocal, formatUsd } from "@/lib/money";
import { sumShillings, sumUsd, type MoneyRow } from "@/lib/money-totals";
import { activeAccounts } from "@/lib/accounts";
import { can } from "@/lib/rbac";
import { requirePermission } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";

/*
  The workspace first, the tab second.

  The browser tab was the last place this page still announced itself as
  somewhere else — "Submissions", a word on no screen in the app. It follows
  the query because one route serves two tabs, and a window titled for the
  wrong one is the same confusion in a smaller font.
*/
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}): Promise<Metadata> {
  const { status } = await searchParams;
  const locale = await viewerLocale();
  const tab = t(locale, status === "REJECTED" ? "Sent back" : "With Finance");
  return { title: `${tab} · ${t(locale, "Payment follow-up")}` };
}

const FILTERS = [
  { key: "PENDING", label: "With Finance" },
  /*
    NO VERIFIED TAB.

    A claim Finance has agreed is not a claim any more — it is a payment, with
    a receipt number and two lines in the ledger, and the ledger is where a
    payment is looked up. Keeping a second copy of it here gave this desk a
    list with nothing to do on it and a second place to go asking what happened
    to money, which is how two screens start giving different answers.

    THE ROWS ARE NOT DELETED. Every verified submission stays exactly where it
    was: it is the trail from a customer's screenshot to a receipt, it is what
    lets a payment say who first raised it, and none of that is display. What
    changed is only that this page stopped listing them.
  */
  { key: "REJECTED", label: "Sent back" },
  /*
    TWO CHIPS, AND NO "EVERYTHING".

    Everything mixed claims waiting on Finance with claims Finance refused and
    claims this desk took back, and put a status badge on each so the reader
    could tell them apart again — a list whose rows have to be sorted by eye is
    a list that has stopped answering a question. The two chips left ARE the
    two questions this desk has: what is Finance still holding, and what has
    come back to me.

    Withdrawn claims are in neither, deliberately. A claim taken back is
    finished with; the row stays in the database and in the audit log, which is
    where a finished thing is looked up.
  */
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
  const [rows, rate, payAccounts] = await Promise.all([
    submissionQueue(active as "PENDING" | "REJECTED"),
    currentRateValue(),
    /* To correct the account on a pending claim. Fetched even when nobody on
       this page may correct anything — one list, and the buttons above decide
       whether it is ever shown. */
    activeAccounts(),
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

  /*
    WHICH OF THE ROWS ON SCREEN CAN ACTUALLY BE TAKEN BACK.

    Pending and sent-back, the two states where nothing has moved — the same
    pair withdrawSubmission accepts. A verified claim is money and is unwound
    in the ledger, so it gets no tick and is not counted in "select all";
    "all" must never mean more than the reader can see and act on.
  */
  const takeable = visible.filter(
    (row) => row.status === "PENDING" || row.status === "REJECTED"
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

      {/*
        The headline figure, not just a queue of rows to add up by eye.

        Every other register in this app opens with what it comes to before
        it shows the lines that make it up — the ledger, the expenses list,
        the credit book. This one opened straight into rows and made the
        desk that raised them do the arithmetic themselves to answer "how
        much have I sent up that Finance hasn't dealt with yet".
      */}
      {/*
        ONE FIGURE, IN BOTH MONIES.

        The pair is deliberately identical — same heading, same count, same
        shape — because it is one fact, not two. Bills are quoted in dollars
        and customers hand over shillings, so the desk reading this page is
        asked for whichever the person in front of them is talking about, and
        converting in their head is how a figure gets quoted wrong.

        A previous try put a different measure in the second box, and on a page
        where every row happened to share it the two cards showed the same
        total under two headings — which reads as a fault, not as information.
      */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          {
            key: "TZS",
            value: formatLocal(totalShillings),
            /* Shillings first: it is what was actually handed over. */
            caption:
              active === "PENDING"
                ? t(locale, "sitting with Finance, waiting on a decision")
                : t(locale, "sent back, waiting on this desk"),
          },
          {
            key: "USD",
            value: formatUsd(totalUsd),
            caption: t(locale, "the same money, at today's rate"),
          },
        ].map((card) => (
          <div
            key={card.key}
            className="rounded-xl border bg-card p-4 shadow-soft"
          >
            <p
              className={`text-xs font-semibold uppercase tracking-widest ${
                active === "REJECTED" ? "text-destructive" : "text-warning"
              }`}
            >
              {rows.length}{" "}
              {t(locale, FILTERS.find((f) => f.key === active)?.label ?? "")}
            </p>
            <p className="font-display text-2xl font-bold tabular-nums">
              {card.value}
            </p>
            <p className="font-mono text-xs text-muted-foreground">
              {card.caption}
            </p>
          </div>
        ))}
      </div>

      {/* No second row of chips. Both of these lists are tabs in the
          workspace row above — see the note in CollectionsNav — and a page
          that offers the same two doors twice makes the reader check which
          one they are looking at. */}

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

          This was tried as one full card per claim, matching Finance's verify
          queue — and it is the wrong shape for a desk reading down a list of
          thirteen. Four lines and a bordered panel each is a morning of
          scrolling; the Expenses register answers the same question in two
          lines and is the page this desk asked to be shown instead.

          Everything the card carried is still here: who and how much, the
          method, the reference, who sent it and exactly when, the evidence,
          what Finance decided, and the two ways to put it right.
        */
        /*
          TICKABLE, BECAUSE A LIST OF TWENTY-TWO IS ONE DECISION.

          A desk handed back a screenful of claims is not making twenty-two
          decisions about them — the same reason applies to all of them, and
          clicking twenty-two times is the only part that takes any time.
          Only the rows that can actually be taken back are offered a tick;
          a verified claim is money and is unwound in the ledger, not here.
        */
        <BulkSelect ids={takeable.map((row) => row.id)}>
        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
          {takeable.length > 0 ? (
            <div className="flex items-center justify-between border-b bg-muted/20 px-4 py-1.5">
              <SelectAllTick />
              <span className="text-[11px] text-muted-foreground">
                {takeable.length} {t(locale, "can be deleted")}
              </span>
            </div>
          ) : null}
          <ul className="divide-y">
            {visible.map((row) => (
              <li
                key={row.id}
                id={row.submissionNumber}
                className="scroll-mt-6 px-4 py-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  {/* Only where there is something to decide. A tick beside a
                      verified claim would offer an action that does not
                      exist. */}
                  {row.status === "PENDING" || row.status === "REJECTED" ? (
                    <RowTick id={row.id} label={row.submissionNumber} />
                  ) : (
                    <span className="w-4 shrink-0" aria-hidden />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {row.invoice.customer.name}
                      {/* No status badge. It existed for the mixed list, and
                          both chips left are a single status — so it said, on
                          every row of a page called Sent back, that the row
                          was sent back. */}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <span className="font-mono">{row.submissionNumber}</span>
                      <span>·</span>
                      <Link
                        href={`/app/cargo/${row.invoice.shipment.trackingNumber}`}
                        className="font-mono hover:text-brand"
                      >
                        {row.invoice.shipment.trackingNumber}
                      </Link>
                      <span>·</span>
                      <span className="font-mono">
                        {row.invoice.invoiceNumber}
                      </span>
                      {/* WHERE it landed, and the code off the customer's
                          message — the two things Finance checks it against.

                          This said "Mobile money" for years, which is a kind of
                          thing rather than a fact: the company runs real named
                          accounts, and "Airtel Money" and "Mixx by Yas" are both
                          mobile money. Naming the account answers the question
                          the desk is actually asking, and where nobody named
                          one it says so instead of implying one. */}
                      <span>·</span>
                      {/* Once Finance has decided, the account the PAYMENT
                          landed in is the answer — a claim raised before
                          naming one was compulsory has none of its own, and
                          reading "no account named" beside a receipt that
                          plainly says CRDB Bank is the register contradicting
                          the ledger. Still pending, the desk's own answer is
                          all there is. */}
                      {(row.payment?.account ?? row.account) ? (
                        <span>
                          {(row.payment?.account ?? row.account)!.name}
                        </span>
                      ) : (
                        <span className="text-warning">
                          {t(locale, "no account named")}
                        </span>
                      )}
                      {row.reference ? (
                        <>
                          <span>·</span>
                          <span className="font-mono">{row.reference}</span>
                        </>
                      ) : null}
                      {/* When it went up, to the minute — and who sent it,
                          but only when that was somebody else.

                          Named as "Submitted by" rather than left as a bare
                          name, because further along the line is the name of
                          whoever decided it, and two bare names read as one
                          person doing both. The desk that raised a claim was
                          losing the credit for it the moment Finance signed
                          it off.

                          Suppressed on your own rows. This is the page a desk
                          opens to see its own work, so every line repeating
                          the reader's own name is noise standing where a fact
                          should be. */}
                      <span>·</span>
                      <span>
                        {row.submittedBy && row.submittedBy.id !== user.id ? (
                          <>
                            {t(locale, "Submitted by")}{" "}
                            <span className="text-foreground">
                              {row.submittedBy.name}
                            </span>{" "}
                            ·{" "}
                          </>
                        ) : null}
                        {formatDateTime(row.submittedAt, locale)}
                      </span>
                      {row.proofs.length > 0 ? (
                        <>
                          <span>·</span>
                          <a
                            href={row.proofs[0].url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 hover:text-brand"
                          >
                            <Paperclip className="h-3 w-3" />
                            {row.proofs.length === 1
                              ? t(locale, "proof")
                              : `${row.proofs.length} ${t(locale, "proofs")}`}
                          </a>
                        </>
                      ) : (
                        <>
                          <span>·</span>
                          {/* The one thing on this row that is a problem
                              rather than a detail: a claim with nothing
                              behind it is somebody's word, and Finance is
                              about to move money on it. */}
                          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-destructive/15 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                            <Paperclip className="h-3 w-3" />
                            {t(locale, "no proof attached")}
                          </span>
                        </>
                      )}
                      {/* What became of it, on the same line rather than in a
                          block of its own. */}
                      {row.status === "VERIFIED" ? (
                        <>
                          <span>·</span>
                          <span className="text-success">
                            {t(locale, "Verified by")}{" "}
                            {row.reviewedBy?.name ?? t(locale, "Finance")}
                            {row.payment?.receipt
                              ? ` · ${row.payment.receipt.receiptNumber}`
                              : ""}
                          </span>
                        </>
                      ) : null}
                      {row.status === "REJECTED" ? (
                        <>
                          {/* Only where the list is mixed. On the Sent back
                              tab every row was sent back, and this repeated
                              the same name and the same sentence down the
                              whole page — in red, so it read as twenty-one
                              different problems. Who refused it and what they
                              said is in the panel that opens, beside the
                              fields for answering it. */}
                          {/* Nor who refused it, on a page where every row
                              was refused by somebody. The name and the words
                              are in the panel that opens, next to the fields
                              for answering them. */}
                          {/* Under Everything, a refused claim whose bill has
                              since been settled would otherwise read as work
                              still owed. It is the record, not a job — the
                              Sent back tab already leaves it out. */}
                          {toNumber(row.invoice.total) -
                            toNumber(row.invoice.amountPaid) <=
                          0 ? (
                            <>
                              <span>·</span>
                              <span className="text-success">
                                {t(locale, "settled since")}
                              </span>
                            </>
                          ) : null}
                        </>
                      ) : null}
                      {row.status === "WITHDRAWN" ? (
                        <>
                          <span>·</span>
                          <span>
                            {t(locale, "Withdrawn by us")}
                            {row.rejectionReason ? `: ${row.rejectionReason}` : ""}
                          </span>
                        </>
                      ) : null}
                      {row.note ? (
                        <>
                          <span>·</span>
                          <span>{row.note}</span>
                        </>
                      ) : null}
                    </p>
                  </div>

                  {/* Money and the two ways to put it right, on the same line
                      as the claim — the Expenses register's own shape. */}
                  <div className="flex shrink-0 items-center gap-3">
                    <div className="text-right">
                      <p className="font-mono text-sm font-medium tabular-nums">
                        {formatMoney(toNumber(row.amount), row.currency)}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {t(locale, "owed")}{" "}
                        {formatMoney(
                          toNumber(row.invoice.total) -
                            toNumber(row.invoice.amountPaid),
                          row.invoice.currency
                        )}
                      </p>
                    </div>
                    {/* Rendered on every row, whatever its status and whoever
                        is reading. A decided claim opens read-only; a reader
                        without payment.submit gets the same door. The register
                        used to go blank at exactly the moment somebody wants
                        to know what happened to it. */}
                    <SubmissionCorrection
                      canEdit={canCorrect}
                      accounts={payAccounts}
                      subject={{
                        submissionId: row.id,
                        submissionNumber: row.submissionNumber,
                        invoiceId: row.invoice.id,
                        invoiceNumber: row.invoice.invoiceNumber,
                        trackingNumber: row.invoice.shipment.trackingNumber,
                        customerName: row.invoice.customer.name,
                        customerPhone: row.invoice.customer.phone,
                        amount: toNumber(row.amount),
                        currency: row.currency,
                        invoiceCurrency: row.invoice.currency,
                        invoiceRate:
                          row.invoice.exchangeRate === null
                            ? null
                            : toNumber(row.invoice.exchangeRate),
                        outstanding:
                          toNumber(row.invoice.total) -
                          toNumber(row.invoice.amountPaid),
                        accountId: row.accountId,
                        settledAccountName: row.payment?.account?.name ?? null,
                        reference: row.reference,
                        note: row.note,
                        status: row.status,
                        submittedByName: row.submittedBy?.name ?? null,
                        /* Formatted here: the dialog is a client component
                           using useT(), and formatDateTime needs the locale
                           this server page already holds. */
                        submittedAtLabel: formatDateTime(row.submittedAt, locale),
                        reviewedByName: row.reviewedBy?.name ?? null,
                        rejectionReason: row.rejectionReason,
                        receiptNumber: row.payment?.receipt?.receiptNumber ?? null,
                        proofs: row.proofs,
                        replacedByNumber: row.replacedBy?.submissionNumber ?? null,
                        replacesNumber: row.replaces?.submissionNumber ?? null,
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Withdrawal, not deletion — see withdrawSubmission. The row stays,
            because "somebody said this customer had paid" is true whatever is
            decided afterwards; what changes is that nobody is waiting on it. */}
        <BulkBar
          action={withdrawSubmissions}
          tone="destructive"
          /* The same word as the button on the row, because it is the same
             job. A second name for one action is a second thing to learn. */
          verb={t(locale, "Delete")}
          noun={t(locale, "payment")}
          nounPlural={t(locale, "payments")}
          pendingLabel={t(locale, "Deleting…")}
          note={t(locale, "The bills do not change. The cargo goes back on the call list.")}
        />
        </BulkSelect>
      )}
    </>
  );
}
