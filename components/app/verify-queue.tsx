import Link from "next/link";
import { FileText, Paperclip } from "lucide-react";

import { EmptyState } from "@/components/app/empty-state";
import { VerifySubmission } from "@/components/app/verify-submission";
import { Badge } from "@/components/ui/badge";
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
        <ul className="space-y-3">
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
                className="panel scroll-mt-24 overflow-hidden"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold">
                      {row.invoice.customer.name}
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
                      {formatMoney(claimed, row.currency)}
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
                          value: t(
                            locale,
                            row.method.replace(/_/g, " ").toLowerCase()
                          ),
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

                    {mismatch ? (
                      <Badge
                        variant="outline"
                        className="border-warning/40 font-normal text-warning"
                      >
                        {t(
                          locale,
                          "does not match the balance — check before agreeing"
                        )}
                      </Badge>
                    ) : null}
                    {row.note ? (
                      <p className="text-xs text-muted-foreground">{row.note}</p>
                    ) : null}

                    <ul className="flex flex-wrap gap-2 pt-1">
                      {row.proofs.length === 0 ? (
                        <li className="text-xs text-destructive">
                          {t(
                            locale,
                            "nothing attached — do not verify without evidence"
                          )}
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

                  <div className="lg:min-w-[15rem]">
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
      )}
    </>
  );
}
