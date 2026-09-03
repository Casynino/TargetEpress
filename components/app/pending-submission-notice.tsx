import Link from "next/link";
import { ArrowRight, Hourglass, Paperclip } from "lucide-react";

import { VerifySubmission } from "@/components/app/verify-submission";
import { formatMoney, formatRelative } from "@/lib/format";
import { t } from "@/lib/i18n";
import { viewerLocale } from "@/lib/viewer";

export type PendingSubmission = {
  /** Needed to act on it from here rather than only to name it. */
  id: string;
  submissionNumber: string;
  amount: number;
  currency: string;
  /** Which account the desk says it landed in. Null on claims raised before
      naming one was compulsory. */
  accountName: string | null;
  reference: string | null;
  submittedAt: Date;
  submittedByName: string | null;
  proofCount: number;
};

/**
 * "Somebody has already paid for this — it just has not been agreed yet."
 *
 * Customer Support collects a customer's proof at the counter and hands it up;
 * it is not a payment until Finance verifies it, so the cargo still reads as
 * unpaid and the Record payment form still offers the full outstanding balance
 * pre-filled. Without this panel the two facts never meet: Finance opens the
 * cargo, sees a balance owing, and records a payment for money that is already
 * sitting in the verification queue. The customer is billed twice and the books
 * disagree with the tin.
 *
 * So it goes directly above the Record payment form rather than somewhere
 * tidier. Every desk that can see money sees it, because each has a different
 * thing to do about it: Finance verifies, Support waits and can tell the
 * customer where it has got to, and the CEO can see why cargo that looks unpaid
 * is not being chased.
 */
export async function PendingSubmissionNotice({
  submissions,
  canVerify,
  accounts,
}: {
  submissions: PendingSubmission[];
  /** payment.verify — Finance and the CEO. */
  canVerify: boolean;
  /** Where the money landed. Empty for desks that may not verify. */
  accounts: { id: string; name: string; currency: string }[];
}) {
  if (submissions.length === 0) return null;

  const locale = await viewerLocale();

  return (
    <section className="panel overflow-hidden border-warning/40">
      <header className="flex items-center gap-2 border-b border-warning/30 bg-warning/10 px-5 py-3">
        <Hourglass className="h-4 w-4 shrink-0 text-warning" />
        <h2 className="font-display text-sm font-semibold text-warning">
          {submissions.length === 1
            ? t(locale, "A payment is waiting to be verified")
            : `${submissions.length} ${t(locale, "payments are waiting to be verified")}`}
        </h2>
      </header>

      <ul className="divide-y">
        {submissions.map((s) => (
          <li key={s.submissionNumber} className="px-5 py-4">
            <p className="text-sm">
              <span className="font-semibold tabular-nums">
                {formatMoney(s.amount, s.currency)}
              </span>{" "}
              {t(locale, "Submitted by")}{" "}
              <span className="font-medium text-brand">
                {s.submittedByName ?? t(locale, "Customer Support")}
              </span>{" "}
              <span className="text-muted-foreground">
                {formatRelative(s.submittedAt, locale)}
              </span>
            </p>

            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs text-muted-foreground">
              <span>{s.submissionNumber}</span>
              <span aria-hidden>·</span>
              {/* Lifted out of the mono run: an account is a proper noun and
                  reads badly in a monospace face beside reference codes. */}
              <span className="font-sans">
                {s.accountName ?? t(locale, "no account named")}
              </span>
              {s.reference ? (
                <>
                  <span aria-hidden>·</span>
                  <span>{s.reference}</span>
                </>
              ) : null}
              {s.proofCount > 0 ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="inline-flex items-center gap-1">
                    <Paperclip className="h-3 w-3" />
                    {s.proofCount}{" "}
                    {t(locale, s.proofCount === 1 ? "proof" : "proofs")}
                  </span>
                </>
              ) : null}
            </p>

            {/*
              The decision, on the row it belongs to.

              Finance used to be sent to another screen to agree money it was
              already looking at, and the server now refuses a second payment
              outright — so without this the refusal would be a dead end rather
              than a redirection. Same component the verify queue uses, so a
              claim settled from here produces exactly the receipt, ledger line
              and pickup note it would have produced there.
            */}
            {canVerify ? (
              <div className="mt-3">
                <VerifySubmission submissionId={s.id} accounts={accounts} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <footer className="border-t bg-muted/20 px-5 py-3">
        {canVerify ? (
          <>
            {/* The warning and its fix in one place. A caution with no way to
                act on it just makes the next person hesitate. */}
            <p className="text-xs text-muted-foreground">
              {t(
                locale,
                "Agree it above and it posts to the ledger itself. Recording it again below is refused — it would take the same money twice."
              )}
            </p>
            <Link
              href={`/app/finance/verify#${submissions[0].submissionNumber}`}
              className="focus-ring mt-2 inline-flex items-center gap-1.5 rounded-lg bg-warning px-3 py-1.5 text-xs font-semibold text-warning-foreground transition-colors hover:bg-warning/90"
            >
              {t(locale, "Verify it")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t(
              locale,
              "With Finance now. Nothing is settled and no pickup note can be issued until they check it — this is what to tell the customer if they ring."
            )}
          </p>
        )}
      </footer>
    </section>
  );
}
