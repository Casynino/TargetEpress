import { Hourglass, Paperclip } from "lucide-react";

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
  /** The delivery half of the claim, when the customer paid the cargo and the
      transport in one transfer. Zero on almost every claim. */
  transport?: number;
  /** Where Support expects the fare to come from — cash or the Lipa number. */
  transportSourceId?: string | null;
  transportSourceName?: string | null;
  /** Support ticked "the rest is not coming" when they raised it. */
  clearShortfall?: boolean;
  /** One transfer against several bills — the tick is withheld there. */
  clearsOn?: string | null;
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
  transportAccounts = [],
  billCurrency = "USD",
  billOutstanding = 0,
  billRate = null,
}: {
  submissions: PendingSubmission[];
  /** payment.verify — Finance and the CEO. */
  canVerify: boolean;
  /** Where the money landed. Empty for desks that may not verify. */
  accounts: { id: string; name: string; currency: string }[];
  /** Cash and Lipa accounts only, for the transport leg. Narrowed per claim
      to the currency that claim came in — an account cannot give up money it
      is not denominated in. */
  transportAccounts?: { id: string; name: string; currency: string }[];
  /** The bill these claims answer, so the verify panel can say what one of
      them would leave owing. */
  billCurrency?: string;
  billOutstanding?: number;
  /** The rate frozen onto the bill — what a claim in another currency will
      actually settle at. */
  billRate?: number | null;
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

            {/* Why the figure above is bigger than the bill: the customer
                paid the cargo and the delivery in one transfer, and Support
                said so when they sent it up. Without this the panel reads as
                an overpayment nobody can explain. */}
            {s.transport && s.transport > 0 ? (
              <p className="mt-1 text-xs font-medium text-warning">
                {formatMoney(s.amount - s.transport, s.currency)}{" "}
                {t(locale, "to the bill")} ·{" "}
                {formatMoney(s.transport, s.currency)} {t(locale, "transport")}
              </p>
            ) : null}

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
                <VerifySubmission
                  submissionId={s.id}
                  accounts={accounts}
                  currency={s.currency}
                  transport={s.transport ?? 0}
                  cargo={s.amount - (s.transport ?? 0)}
                  transportSourceId={s.transportSourceId ?? null}
                  transportSourceName={s.transportSourceName ?? null}
                  transportAccounts={transportAccounts.filter(
                    (a) => a.currency === s.currency
                  )}
                  shortfall={Math.max(
                    0,
                    billOutstanding -
                      (s.currency === billCurrency || !billRate
                        ? s.amount - (s.transport ?? 0)
                        : s.currency === "TZS"
                          ? (s.amount - (s.transport ?? 0)) / billRate
                          : (s.amount - (s.transport ?? 0)) * billRate)
                  )}
                  billCurrency={billCurrency}
                  billRate={billRate}
                  clearShortfallClaimed={Boolean(s.clearShortfall)}
                  clearsOn={s.clearsOn ?? null}
                />
              </div>
            ) : null}
          </li>
        ))}
      </ul>

      <footer className="border-t bg-muted/20 px-5 py-3">
        {canVerify ? (
          /*
            THE SENTENCE, AND NO SECOND BUTTON.

            This footer used to carry a "Verify it" link to the verify queue,
            from the days when agreeing a claim meant going to another screen.
            The decision moved onto the row above — see the note beside
            VerifySubmission — and the link stayed, so the panel offered the
            same job twice and a reader had to work out whether the two did the
            same thing.

            The sentence stays, because it is the one that explains why the
            Record payment form below is going to refuse them.
          */
          <p className="text-xs text-muted-foreground">
            {t(
              locale,
              "Agree it above and it posts to the ledger itself. Recording it again below is refused — it would take the same money twice."
            )}
          </p>
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
