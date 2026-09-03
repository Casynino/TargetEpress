import Link from "next/link";
import { FileText, Paperclip } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { SubmissionCorrection } from "@/components/app/submission-correction";
import { VerifySubmission } from "@/components/app/verify-submission";
import { activeAccounts } from "@/lib/accounts";
import { submissionQueue } from "@/lib/collections";
import { formatDateTime, formatMoney, toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer";

/**
 * What Customer Support says customers have paid, waiting on Finance.
 *
 * The queue without any surrounding chrome, because it is reached from two
 * workspaces and each keeps its own. Finance opens it as a tab of the General
 * ledger; the same person opens it as a tab of Collections while working the
 * money end to end. Sending them to the other workspace's page mid-job threw
 * them out of the row of tabs they were using, so both routes render this and
 * bring their own navigation.
 *
 * One implementation, two doorframes — not two copies. A second copy of a
 * screen that takes money is a second place for the rules to drift.
 *
 * Everything needed to decide is on the row: what the customer claims, the
 * reference they gave, the bill it settles, and the evidence they sent — shown
 * as a link that opens, not as a count. Nobody should have to go looking for a
 * screenshot to do this job.
 *
 * Verifying calls the same recordPayment the counter uses, so a claim agreed
 * here produces exactly the receipt, ledger entry and pickup note that a
 * payment taken at the desk would. Nothing about recording a payment is
 * reimplemented for this queue.
 */
export async function VerifyQueue() {
  const locale = await viewerLocale();
  const [rows, accounts] = await Promise.all([
    submissionQueue("PENDING"),
    activeAccounts(),
  ]);

  const total = rows.reduce((sum, row) => sum + toNumber(row.amount), 0);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 text-sm">
        <p className="text-muted-foreground">
          {rows.length} {t(locale, "waiting on you")}
        </p>
        {rows.length > 0 ? (
          <p className="font-mono tabular-nums">
            <span className="text-muted-foreground">
              {t(locale, "Claimed")}{" "}
            </span>
            <span className="font-semibold">{total.toLocaleString("en-US")}</span>
          </p>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={t(locale, "Nothing to verify")}
          description={t(
            locale,
            "Customer Support has not handed anything up that is still waiting."
          )}
        />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card shadow-soft">
          <ul className="divide-y">
            {rows.map((row) => {
              const outstanding =
                toNumber(row.invoice.total) - toNumber(row.invoice.amountPaid);
              const claimed = toNumber(row.amount);
              // A claim that does not match what is owed is the one worth a
              // second look, so it is flagged rather than left to be spotted.
              const mismatch =
                row.currency === row.invoice.currency &&
                Math.abs(claimed - outstanding) > 0.5;

              return (
                <li
                  key={row.id}
                  id={row.submissionNumber}
                  className="scroll-mt-24 px-4 py-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {row.invoice.customer.name}
                        {mismatch ? (
                          <span className="ml-2 rounded bg-warning/15 px-1.5 py-0.5 text-[11px] font-normal text-warning">
                            {t(locale, "does not match the balance")}
                          </span>
                        ) : null}
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
                        {/* Where the desk says it landed. Finance is deciding
                            exactly this, so it belongs on the row rather than
                            behind a click.

                            This used to be preceded by the payment method, which
                            said "Mobile money" immediately before naming the
                            mobile-money account — the same fact twice, the
                            second time precisely. */}
                        <span>·</span>
                        <span>
                          {row.account?.name ?? (
                            <span className="text-warning">
                              {t(locale, "no account named")}
                            </span>
                          )}
                        </span>
                        {row.reference ? (
                          <>
                            <span>·</span>
                            <span className="font-mono">{row.reference}</span>
                          </>
                        ) : null}
                        <span>·</span>
                        <span>
                          {t(locale, "Submitted by")}{" "}
                          <span className="text-foreground">
                            {row.submittedBy?.name ?? "—"}
                          </span>{" "}
                          · {formatDateTime(row.submittedAt, locale)}
                        </span>
                        {/* The evidence, or the fact that there is none. The
                            warning keeps its colour: agreeing to money on
                            somebody's word is the one thing this queue exists
                            to make somebody look at twice. */}
                        {row.proofs.length === 0 ? (
                          <>
                            <span>·</span>
                            {/* A badge, not loose red words. On a row with a
                                long figure the meta line wraps and this landed
                                alone on the second line, reading as a mistake
                                rather than a flag. Shaped, it reads the same
                                wherever it falls. */}
                            <span className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-destructive/15 px-1.5 py-0.5 text-[11px] font-medium text-destructive">
                              <Paperclip className="h-3 w-3" />
                              {t(locale, "no proof attached")}
                            </span>
                          </>
                        ) : (
                          row.proofs.map((proof) => (
                            <span key={proof.id} className="inline-flex items-center gap-2">
                              <span>·</span>
                              <a
                                href={proof.url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 hover:text-brand"
                              >
                                {proof.contentType.startsWith("image/") ? (
                                  <Paperclip className="h-3 w-3" />
                                ) : (
                                  <FileText className="h-3 w-3" />
                                )}
                                {proof.filename ?? t(locale, "Proof")}
                              </a>
                            </span>
                          ))
                        )}
                        {row.note ? (
                          <>
                            <span>·</span>
                            <span>{row.note}</span>
                          </>
                        ) : null}
                      </p>
                    </div>

                    {/* What is claimed, what is owed, and the decision — on the
                        same line as the claim, the way the Expenses register
                        keeps its money and its actions together. */}
                    <div className="flex shrink-0 items-center gap-3">
                      <div className="text-right">
                        <p className="font-mono text-sm font-medium tabular-nums">
                          {formatMoney(claimed, row.currency)}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {t(locale, "owed")}{" "}
                          {formatMoney(outstanding, row.invoice.currency)}
                        </p>
                      </div>
                      {/* Correct it, then decide it. A wrong figure or the
                          wrong account found at this moment used to mean
                          sending the whole claim back for somebody else to
                          retype. Taking it back is not offered here: refusing
                          a colleague's claim is Send back, which records who
                          refused it and why. */}
                      <SubmissionCorrection
                        canEdit
                        canDelete={false}
                        accounts={accounts.map((a) => ({
                          id: a.id,
                          name: a.name,
                          currency: a.currency,
                        }))}
                        subject={{
                          submissionId: row.id,
                          submissionNumber: row.submissionNumber,
                          invoiceId: row.invoice.id,
                          invoiceNumber: row.invoice.invoiceNumber,
                          trackingNumber: row.invoice.shipment.trackingNumber,
                          customerName: row.invoice.customer.name,
                          customerPhone: row.invoice.customer.phone,
                          amount: claimed,
                          currency: row.currency,
                          invoiceCurrency: row.invoice.currency,
                          invoiceRate:
                            row.invoice.exchangeRate === null
                              ? null
                              : toNumber(row.invoice.exchangeRate),
                          outstanding,
                          accountId: row.accountId,
                          settledAccountName:
                            row.payment?.account?.name ?? null,
                          reference: row.reference,
                          note: row.note,
                          status: row.status,
                          submittedByName: row.submittedBy?.name ?? null,
                          submittedAtLabel: formatDateTime(row.submittedAt, locale),
                          reviewedByName: row.reviewedBy?.name ?? null,
                          rejectionReason: row.rejectionReason,
                          receiptNumber:
                            row.payment?.receipt?.receiptNumber ?? null,
                          proofs: row.proofs,
                          replacedByNumber: row.replacedBy?.submissionNumber ?? null,
                          replacesNumber: row.replaces?.submissionNumber ?? null,
                        }}
                      />
                      <VerifySubmission
                        submissionId={row.id}
                        accounts={accounts.map((a) => ({
                          id: a.id,
                          name: a.name,
                          currency: a.currency,
                        }))}
                      />
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
