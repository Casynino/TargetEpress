"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";

import { methodForKind } from "@/lib/accounts";
import { recordAudit, withNote } from "@/lib/audit";
import { nextSubmissionNumber } from "@/lib/ids";
import { toNumber } from "@/lib/format";
import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { filesFrom, putDocument } from "@/lib/storage";
import { can } from "@/lib/rbac";
import { authorize } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, ok, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

/**
 * Correcting what this desk sent up to Finance.
 *
 * A submission is a claim, not money: "the customer says they paid this much,
 * here is their screenshot". Until Finance rules on it, nothing has moved — no
 * ledger line, no receipt, no change to the bill. Which makes it the one money
 * record in the system that CAN be edited in place, and the reason the rules here
 * are different from the ones on a payment.
 *
 * Two things a desk needs and did not have:
 *
 *   EDIT, while it is still pending. A mistyped M-Pesa code or an amount with an
 *   extra nought was previously fixed by asking Finance to reject it and sending
 *   a second one, which leaves a customer with a rejection on their record for
 *   our typing error.
 *
 *   WITHDRAW, also while pending. Sent up against the wrong invoice, or twice.
 *   Recorded as WITHDRAWN rather than REJECTED, because "Finance said no" and "we
 *   sent this by mistake" are different facts about a customer, and a queue that
 *   conflates them tells the next person to ring somebody about nothing.
 *
 * Once Finance has VERIFIED it, this file is finished: a real payment exists and
 * has moved an account, and unwinding that is voidPayment's job, not an edit.
 */

/** Only a pending claim may be touched. After that, money exists. */
async function pendingOnly(id: string) {
  const sub = await prisma.paymentSubmission.findUnique({
    where: { id },
    select: {
      id: true,
      submissionNumber: true,
      status: true,
      amount: true,
      currency: true,
      reference: true,
      note: true,
      accountId: true,
      /* The delivery half. A correction that moves the total without saying
         what happened to the fare silently re-splits the payment. */
      transportAmount: true,
      transportSourceId: true,
      /* Finance's words, kept when a refused claim is taken back rather than
         overwritten by the desk's own reason. */
      rejectionReason: true,
      submittedById: true,
      invoice: {
        select: {
          id: true,
          invoiceNumber: true,
          shipment: { select: { trackingNumber: true } },
        },
      },
      /* How many bills it answers — a combined claim's total cannot be
         restated without saying how the change is split. */
      _count: { select: { allocations: true } },
    },
  });
  return sub;
}

/** The message for a claim that is no longer open to change. */
function closedMessage(status: string, number: string) {
  if (status === "VERIFIED") {
    return `${number} has already been verified by Finance, so a real payment exists against it. Cancel that payment instead of editing this claim.`;
  }
  if (status === "REJECTED") {
    return `${number} was sent back by Finance. Raise a new claim rather than editing a closed one.`;
  }
  return `${number} was already withdrawn.`;
}

export async function editSubmission(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    /* The same permission that raised it. Fixing your own typo before anybody
       has acted on it is part of recording it, not a separate authority. */
    const user = await authorize("payment.submit");
    const parsed = z
      .object({
        submissionId: z.string().min(1),
        amount: z.coerce
          .number()
          .positive("That amount is not valid.")
          .optional(),
        reference: z.string().trim().optional(),
        note: z.string().trim().optional(),
        /* Correcting the account is the whole point of letting Finance touch
           a claim before deciding it — a customer naming the wrong bank is
           the commonest thing wrong with one. */
        accountId: z.string().trim().optional(),
        /* What the customer actually handed over. Correctable because getting
           it wrong is an ordinary mistake — a dollar bill settled in shillings
           and typed as dollars — and because the account it may have landed in
           depends on the answer. */
        currency: z.enum(["TZS", "USD"]).optional(),
        /* Optional — warn, confirm, do. What changed is listed on the
           audit line beside the name of whoever changed it. */
        reason: z.string().trim().max(300, "Keep the note under 300 characters.").optional(),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const sub = await pendingOnly(parsed.data.submissionId);
    if (!sub) return fail(t(locale, "That submission no longer exists."));
    if (sub.status !== "PENDING") {
      return fail(t(locale, closedMessage(sub.status, sub.submissionNumber)));
    }
    /* "Your own typo" is the whole licence — for the desk that raised it. A
       colleague's claim is theirs to fix, not yours.
       Finance is the exception, and has to be: they are the desk about to
       decide this claim, and finding a wrong figure or the wrong account at
       that moment should not mean bouncing it back and waiting for somebody
       else to retype it. Whatever they change is recorded against their name
       like any other correction. */
    if (sub.submittedById !== user.id && !can(user.role, "payment.verify")) {
      return fail(
        t(locale, "Only the person who submitted this can correct it. Ask them to, or let Finance decide it as it stands.")
      );
    }

    const before = {
      amount: toNumber(sub.amount),
      reference: sub.reference,
      note: sub.note,
      accountId: sub.accountId,
      currency: sub.currency,
    };
    const after = {
      amount: parsed.data.amount ?? before.amount,
      reference: parsed.data.reference || null,
      note: parsed.data.note || null,
      accountId: parsed.data.accountId || before.accountId,
      currency: parsed.data.currency ?? before.currency,
    };

    /* Same three questions the submit action asks of an account, asked again
       here — a correction that could name an archived or wrong-currency
       account would walk straight past the rule the submit form enforces. */
    if (
      after.accountId &&
      (after.accountId !== before.accountId ||
        after.currency !== before.currency)
    ) {
      const account = await prisma.companyAccount.findUnique({
        where: { id: after.accountId },
        select: { name: true, currency: true, active: true },
      });
      if (!account) return fail(t(locale, "That account no longer exists."));
      if (!account.active) {
        return fail(`${account.name} has been archived.`);
      }
      if (account.currency !== after.currency) {
        return fail(
          `${account.name} is a ${account.currency} account, so ${after.currency} could not have landed in it.`
        );
      }
    }
    const changed = (Object.keys(after) as (keyof typeof after)[]).filter(
      (k) => before[k] !== after[k]
    );
    if (changed.length === 0) return fail(t(locale, "Nothing was changed."));

    /*
      A CLAIM'S TOTAL IS THE SUM OF ITS PARTS.

      Its allocations say how much answers each bill. Moving the total without
      restating them leaves the two disagreeing, and Finance then verifies a
      figure the split cannot account for — one bill credited with another's
      money. The reference, the note and the account are all still correctable;
      only the figure has to go back through the form that asks how it splits.

      More than one bill is refused. Exactly one is not ambiguous — there is
      only one place the difference can go — so the allocation is restated
      below and the desk keeps the ordinary correction of a mistyped figure.
    */
    if (sub._count.allocations > 1 && changed.includes("amount")) {
      return fail(
        t(
          locale,
          "This claim covers more than one bill, so its total cannot be changed here. Withdraw it and raise the payment again against the bills it should cover."
        )
      );
    }

    /*
      A TOTAL THAT CARRIES A FARE CANNOT BE RESTATED ON ITS OWN.

      The claim's figure is the cargo AND the delivery. Change only the total
      and the split moves silently underneath it: a 46,450 claim carrying a
      10,000 fare, corrected to 36,450 because the customer rang back, leaves
      the fare untouched and quietly turns 36,450 of freight into 26,450.
      Nobody typed that number and nobody is shown it.

      This screen has one money field, so there is no honest answer for it to
      take. Refused with the way out, rather than guessed at — the same
      treatment a combined claim's total already gets two blocks above.
    */
    const claimFare = toNumber(sub.transportAmount);
    if (claimFare > 0 && changed.includes("amount")) {
      return fail(
        t(
          locale,
          `This claim includes ${sub.currency} ${claimFare.toLocaleString()} of transport, so its total cannot be changed here — the split would move without anybody saying so. Withdraw it and raise the payment again with the right figures.`
        )
      );
    }
    /* Same reason: the fare is quoted in the money it was taken in, and
       restating the currency without restating the fare changes what leaves
       the till. */
    if (claimFare > 0 && changed.includes("currency")) {
      return fail(
        t(
          locale,
          "This claim includes transport, so its currency cannot be changed here. Withdraw it and raise the payment again."
        )
      );
    }

    await prisma.$transaction(async (tx) => {
      /* Still pending at the moment of writing. Finance may have verified it
         while this form sat open, and editing the claim behind a payment that
         already exists would leave the two describing different money. */
      const claimed = await tx.paymentSubmission.updateMany({
        where: { id: sub.id, status: "PENDING" },
        data: {
          amount: new Prisma.Decimal(after.amount),
          reference: after.reference,
          note: after.note,
          accountId: after.accountId,
          currency: after.currency,
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          `${sub.submissionNumber} was decided by Finance a moment ago. Reload before editing it.`
        );
      }

      /* And the split moves with the total. Verifying reads the allocations,
         not the claim's own figure, so leaving a stale one behind would settle
         the bill at the amount before the correction. */
      /* The CARGO half, not the gross figure. An allocation says how much of
         a bill this claim answers, and the fare answers none of it — writing
         the whole total here made every transport-bearing claim allocate more
         than it had, which the counter action refuses on verification. Zero
         while the block above refuses an amount change on a claim that has a
         fare, and correct the day that screen learns to ask for one. */
      if (sub._count.allocations === 1 && changed.includes("amount")) {
        await tx.submissionAllocation.updateMany({
          where: { submissionId: sub.id },
          data: {
            amount: new Prisma.Decimal(
              Math.round((after.amount - claimFare) * 100) / 100
            ),
          },
        });
      }

      await recordAudit(
        {
          actor: user,
          action: "submission.edit",
          entity: "PaymentSubmission",
          entityId: sub.id,
          summary: withNote(
            `${sub.submissionNumber} (${sub.invoice.invoiceNumber}): claim corrected (${changed.join(", ")})`,
            parsed.data.reason
          ),
          metadata: {
            tracking: sub.invoice.shipment?.trackingNumber ?? null,
            before,
            after,
            changed,
            reason: parsed.data.reason ?? null,
          },
        },
        tx
      );
    });

    revalidatePath("/app/collections/submissions");
    revalidatePath(`/app/finance/invoices/${sub.invoice.id}`);
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

export async function withdrawSubmission(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("payment.submit");
    const parsed = z
      .object({
        submissionId: z.string().min(1),
        reason: z.string().trim().max(300, "Keep the note under 300 characters.").optional(),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const sub = await pendingOnly(parsed.data.submissionId);
    if (!sub) return fail(t(locale, "That submission no longer exists."));
    /*
      Two states can be taken back, and for the same reason: nothing has moved.

      PENDING — sent up by mistake, or twice.

      REJECTED — Finance refused it and the desk has decided there is no
      corrected claim coming. The owner's words: cancel it and the cargo just
      stays on the chase list to be recorded again from scratch. That is
      exactly what happens, because the bill is what puts a customer on that
      list and the bill is untouched by any of this.

      VERIFIED is the one that cannot: a real payment exists, and unwinding it
      is voidPayment's job.
    */
    const takeable = sub.status === "PENDING" || sub.status === "REJECTED";
    if (!takeable) {
      return fail(t(locale, closedMessage(sub.status, sub.submissionNumber)));
    }
    if (sub.submittedById !== user.id && !can(user.role, "payment.verify")) {
      return fail(
        t(locale, "Only the person who submitted this can correct it. Ask them to, or let Finance decide it as it stands.")
      );
    }

    await prisma.$transaction(async (tx) => {
      const claimed = await tx.paymentSubmission.updateMany({
        where: { id: sub.id, status: sub.status },
        data: {
          status: "WITHDRAWN",
          reviewedById: user.id,
          reviewedAt: new Date(),
          /* The reason lands in rejectionReason because that column already
             means "why this claim went nowhere", and a second nullable reason
             column would leave two places to look for one answer. The status
             says who decided it — Finance refused, or we took it back.

             Finance's own words are kept in front of the new reason rather
             than overwritten. Losing why a claim was refused, at the moment
             somebody gives up on it, is losing the only sentence that explains
             the whole row. */
          rejectionReason:
            sub.status === "REJECTED" && sub.rejectionReason
              ? withNote(
                  `Withdrawn by the desk that raised it (Finance had said: ${sub.rejectionReason})`,
                  parsed.data.reason
                )
              : parsed.data.reason || "Withdrawn by the desk that raised it",
        },
      });
      if (claimed.count === 0) {
        throw new Error(
          `${sub.submissionNumber} was decided by somebody else a moment ago, so it can no longer be taken back.`
        );
      }

      await recordAudit(
        {
          actor: user,
          action: "submission.withdrawn",
          entity: "PaymentSubmission",
          entityId: sub.id,
          summary: withNote(
            `${sub.submissionNumber} (${sub.invoice.invoiceNumber}): claim of ${sub.currency} ${toNumber(sub.amount).toFixed(2)} withdrawn`,
            parsed.data.reason
          ),
          metadata: {
            tracking: sub.invoice.shipment?.trackingNumber ?? null,
            amount: toNumber(sub.amount),
            currency: sub.currency,
            reason: parsed.data.reason ?? null,
            raisedBy: sub.submittedById,
          },
        },
        tx
      );
    });

    revalidatePath("/app/collections/submissions");
    revalidatePath("/app/collections/follow-up");
    revalidatePath(`/app/finance/invoices/${sub.invoice.id}`);
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/**
 * The customer's evidence, added to a claim that is still only a claim.
 *
 * Support could attach a screenshot at the moment of raising a submission and
 * never again. A customer who sends their proof an hour later — which is most
 * of them — left the desk with a claim marked "nothing attached" and no way to
 * answer it, so Finance was asked to agree to money on somebody's word.
 *
 * Deliberately NOT addPaymentProof. That action takes a paymentId, and a
 * pending submission has no Payment until Finance verifies it; it also demands
 * ledger.adjust, which is Finance's permission and not this desk's. Same job,
 * different object, different authority.
 */
export async function addSubmissionProof(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("payment.submit");
    const submissionId = String(formData.get("submissionId") ?? "");
    if (!submissionId) return fail(t(locale, "That submission no longer exists."));

    const files = filesFrom(formData, "file");
    if (files.length === 0) return fail(t(locale, "Choose a file first."));

    const sub = await pendingOnly(submissionId);
    if (!sub) return fail(t(locale, "That submission no longer exists."));
    /* Once Finance verifies, verifyPaymentSubmission re-points these rows at
       the Payment it created. From that moment the evidence belongs to the
       money, and this desk must not be able to add to it or pull it off. */
    if (sub.status !== "PENDING") {
      return fail(t(locale, closedMessage(sub.status, sub.submissionNumber)));
    }
    if (sub.submittedById !== user.id && !can(user.role, "payment.verify")) {
      return fail(
        t(locale, "Only the person who submitted this can correct it. Ask them to, or let Finance decide it as it stands.")
      );
    }

    /* Stored before the transaction opens, as every other upload here does: a
       file crossing the network must not hold a row lock. */
    const stored = await putDocument(files[0], "proof");
    await prisma.$transaction(async (tx) => {
      await tx.paymentProof.create({
        data: {
          submissionId: sub.id,
          url: stored.url,
          contentType: stored.contentType,
          bytes: stored.bytes,
          filename: files[0].name || null,
          uploadedById: user.id,
        },
      });
      await recordAudit(
        {
          actor: user,
          action: "submission.proof.add",
          entity: "PaymentSubmission",
          entityId: sub.id,
          summary: `${sub.submissionNumber} (${sub.invoice.invoiceNumber}): evidence attached — ${files[0].name || t(locale, "file")}`,
        },
        tx
      );
    });

    revalidatePath("/app/collections/submissions");
    revalidatePath("/app/collections/verify");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/** Take a wrongly attached file off a claim, while it is still only a claim. */
export async function removeSubmissionProof(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("payment.submit");
    const proofId = String(formData.get("proofId") ?? "");
    if (!proofId) return fail(t(locale, "That attachment no longer exists."));

    const proof = await prisma.paymentProof.findUnique({
      where: { id: proofId },
      select: {
        id: true,
        filename: true,
        submissionId: true,
        submission: {
          select: {
            id: true,
            submissionNumber: true,
            status: true,
            submittedById: true,
            invoice: { select: { invoiceNumber: true } },
          },
        },
      },
    });
    /* A proof whose submissionId is null belongs to a Payment — Finance's to
       remove, through their own action, under their own permission. */
    if (!proof?.submissionId || !proof.submission) {
      return fail(t(locale, "That attachment no longer exists."));
    }
    if (proof.submission.status !== "PENDING") {
      return fail(
        t(locale, closedMessage(proof.submission.status, proof.submission.submissionNumber))
      );
    }
    if (
      proof.submission.submittedById !== user.id &&
      !can(user.role, "payment.verify")
    ) {
      return fail(
        t(locale, "Only the person who submitted this can correct it. Ask them to, or let Finance decide it as it stands.")
      );
    }

    await prisma.$transaction(async (tx) => {
      /* Claimed rather than deleted outright: two people with the dialog open
         would otherwise have the second one delete a row that is already gone
         and be told nothing. */
      const claimed = await tx.paymentProof.deleteMany({
        where: { id: proof.id, submissionId: proof.submissionId },
      });
      if (claimed.count === 0) {
        throw new Error("That attachment has already been removed.");
      }
      await recordAudit(
        {
          actor: user,
          action: "submission.proof.remove",
          entity: "PaymentSubmission",
          entityId: proof.submission!.id,
          summary: `${proof.submission!.submissionNumber} (${proof.submission!.invoice.invoiceNumber}): evidence removed — ${proof.filename ?? t(locale, "file")}`,
        },
        tx
      );
    });

    revalidatePath("/app/collections/submissions");
    revalidatePath("/app/collections/verify");
    return ok();
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/**
 * Fixing a refused claim and sending it back up.
 *
 * The Sent back list used to be a dead end. Finance refuses a claim, the desk
 * is told to "raise a new one" — and the only way to do that was to leave the
 * list, find the cargo, and retype everything the refused claim already said,
 * including re-uploading the customer's screenshot. Twenty-one rows of that is
 * a list nobody works, which is exactly what it had become.
 *
 * So it is one action from the row: correct what was wrong and send it.
 *
 * A NEW record, not the old one flipped back to PENDING. Finance made a
 * decision and a decision is not unmade — editing a refused claim back into
 * the queue would leave no trace it was ever refused, and no way to see that
 * Finance has now been asked the same question twice. The old row stays
 * REJECTED and the new one points at it, which is also what takes the old one
 * off the desk's work: it HAS been dealt with.
 *
 * The evidence comes across. New rows against the same stored files — nothing
 * is re-uploaded and the refused claim keeps its own copy, so the record of
 * what Finance was actually looking at when they said no survives intact.
 */
export async function resubmitSubmission(
  _prev: ActionResult | undefined,
  formData: FormData
): Promise<ActionResult<{ submissionNumber: string }>> {
  const locale = await viewerLocale();
  try {
    const user = await authorize("payment.submit");
    const parsed = z
      .object({
        submissionId: z.string().min(1),
        amount: z.coerce.number().positive("That amount is not valid."),
        currency: z.enum(["TZS", "USD"]),
        accountId: z.string().trim().min(1, "Say which account the money landed in."),
        reference: z.string().trim().optional(),
        note: z.string().trim().optional(),
        reason: z.string().trim().max(300, "Keep the note under 300 characters.").optional(),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    const old = await prisma.paymentSubmission.findUnique({
      where: { id: parsed.data.submissionId },
      select: {
        id: true,
        submissionNumber: true,
        status: true,
        invoiceId: true,
        customerId: true,
        submittedById: true,
        /* The delivery half and the till it comes from. A replacement raised
           without them turns the fare into freight: the whole figure is put
           against the bill, so the bill is overpaid or credited, and the money
           that should have left the till never does. */
        transportAmount: true,
        transportSourceId: true,
        currency: true,
        /* The figure as it stands, so a total that moved under a fare can be
           refused rather than silently re-splitting the claim. */
        amount: true,
        replacedBy: { select: { submissionNumber: true } },
        invoice: { select: { invoiceNumber: true, status: true } },
        /* Which bills this claim covered. A combined claim answers several,
           and a replacement that carried none of them was verified against the
           anchor bill alone for the whole sum — the others stayed unpaid and
           kept being chased. */
        allocations: {
          select: {
            invoiceId: true,
            amount: true,
            invoice: { select: { invoiceNumber: true, status: true } },
          },
        },
        proofs: {
          select: { url: true, contentType: true, bytes: true, filename: true },
        },
      },
    });
    if (!old) return fail(t(locale, "That submission no longer exists."));

    /*
      A CLAIM'S FARE IS PART OF THE CLAIM, AND SO IS ITS TOTAL.

      Re-raising is how a refused claim comes back. The desk fixes what Finance
      objected to — usually a reference — and sends it again. If the total or
      the currency is changed at the same time on a claim carrying a fare, the
      split moves silently: the same 10,000 of transport sitting inside a
      different figure means a different amount of freight, and nobody typed
      that number. The correction screen refuses the same change for the same
      reason.
    */
    const oldFare = toNumber(old.transportAmount);
    if (oldFare > 0) {
      if (Math.abs(parsed.data.amount - toNumber(old.amount)) > 0.005) {
        return fail(
          t(
            locale,
            `${old.submissionNumber} includes ${old.currency} ${oldFare.toLocaleString()} of transport, so its total cannot be changed while raising it again. Send it as it was, or withdraw it and raise a fresh payment with the right figures.`
          )
        );
      }
      if (parsed.data.currency !== old.currency) {
        return fail(
          t(
            locale,
            `${old.submissionNumber} includes transport, so its currency cannot be changed while raising it again.`
          )
        );
      }
    }
    /* Only a closed claim is re-raised. A pending one is corrected in place —
       that is what editSubmission is for — and a verified one has produced a
       real payment. */
    if (old.status !== "REJECTED" && old.status !== "WITHDRAWN") {
      return fail(
        t(locale, `${old.submissionNumber} has not been sent back, so there is nothing to raise again.`)
      );
    }
    if (old.replacedBy) {
      return fail(
        t(locale, `${old.submissionNumber} has already been raised again as ${old.replacedBy.submissionNumber}.`)
      );
    }
    if (old.submittedById !== user.id && !can(user.role, "payment.verify")) {
      return fail(
        t(locale, "Only the person who submitted this can correct it. Ask them to, or let Finance decide it as it stands.")
      );
    }
    /* Every bill it covers, not only the one it was anchored to. */
    const settled = [
      old.invoice.status === "PAID" ? old.invoice.invoiceNumber : null,
      ...old.allocations.map((a) =>
        a.invoice.status === "PAID" ? a.invoice.invoiceNumber : null
      ),
    ].filter((n): n is string => n !== null);
    if (settled.length > 0) {
      return fail(
        t(
          locale,
          `${[...new Set(settled)].join(", ")} is already settled, so there is nothing left to claim against it.`
        )
      );
    }

    /*
      A COMBINED CLAIM CANNOT HAVE ITS FIGURE RESTATED HERE.

      The allocations say how much of the money answers each bill. Changing the
      total without saying how the change is split is a question this form does
      not ask, and answering it by guessing is how one bill gets credited with
      another's money. Same amount, and the split is carried across untouched.

      One bill is different: there is only one place the difference can go, so
      the replacement's allocation is written at the corrected figure below.
      Carrying the OLD one across would have Finance settle the bill at the
      amount the desk had just corrected away from.
    */
    const claimed = old.allocations.reduce((sum, a) => sum + toNumber(a.amount), 0);
    if (
      old.allocations.length > 1 &&
      Math.abs(claimed - parsed.data.amount) >= 0.005
    ) {
      return fail(
        t(
          locale,
          "This claim covers more than one bill, so its total cannot be changed here. Withdraw it and raise the payment again against the bills it should cover."
        )
      );
    }

    /*
      New evidence, if the desk has any.

      Often the whole reason a claim came back is that nothing was attached, so
      the fix IS the screenshot. It goes onto the NEW claim rather than onto the
      refused one — what Finance was looking at when they said no must stay
      exactly as it was.

      Uploaded before the transaction opens, as every other upload here does: a
      file crossing the network must not hold a row lock.
    */
    const fresh_files = filesFrom(formData, "proof");
    const uploaded = await Promise.all(
      fresh_files.map(async (file) => {
        const stored = await putDocument(file, "proof");
        return { ...stored, filename: file.name || "proof" };
      })
    );

    const result = await prisma.$transaction(async (tx) => {
      const account = await tx.companyAccount.findUnique({
        where: { id: parsed.data.accountId },
        select: { id: true, name: true, kind: true, currency: true, active: true },
      });
      if (!account) throw new Error("That account no longer exists.");
      if (!account.active) throw new Error(`${account.name} has been archived.`);
      if (account.currency !== parsed.data.currency) {
        throw new Error(
          `${account.name} is a ${account.currency} account, so ${parsed.data.currency} could not have landed in it.`
        );
      }

      /* Same rule the first submission obeys: one claim at a time per bill.
         Two pending claims is two people ringing the same customer and Finance
         agreeing to the same money twice. */
      const covered = [
        old.invoiceId,
        ...old.allocations.map((a) => a.invoiceId),
      ].filter((id): id is string => id !== null);
      const pending = await tx.paymentSubmission.findFirst({
        where: {
          status: "PENDING",
          OR: [
            { invoiceId: { in: covered } },
            { allocations: { some: { invoiceId: { in: covered } } } },
          ],
        },
        select: { submissionNumber: true },
      });
      if (pending) {
        throw new Error(
          `${pending.submissionNumber} is already with Finance for this bill. Wait for it to be checked.`
        );
      }

      /*
        Two people working the same sent-back row is guarded by the database,
        not by a re-read.

        There is nothing to claim on the old row — the link lives on the NEW
        one, as replacesId, and that column is @unique. So a second concurrent
        resubmit collides on the constraint and loses, which is a stronger
        guarantee than re-stating a condition: it holds even if two requests
        pass every check at the same instant. The catch below turns it into a
        sentence somebody at a desk can act on.
      */
      const fresh = await tx.paymentSubmission.create({
        data: {
          submissionNumber: await nextSubmissionNumber(tx),
          invoiceId: old.invoiceId,
          customerId: old.customerId,
          amount: new Prisma.Decimal(parsed.data.amount),
          /* Carried across, because it is part of what this claim IS. The
             refusal above keeps the total and the currency from moving under
             it, so the split that Support wrote down still describes the same
             money on the replacement row. */
          transportAmount: new Prisma.Decimal(oldFare),
          transportSourceId: oldFare > 0 ? old.transportSourceId : null,
          currency: parsed.data.currency,
          method: methodForKind(account.kind),
          accountId: account.id,
          reference: parsed.data.reference || null,
          note: parsed.data.note || null,
          submittedById: user.id,
          replacesId: old.id,
          /* The split goes with it. Without these the replacement looked like
             a single-bill claim, and Finance verifying it put the whole sum
             against the anchor. A one-bill split is restated to the corrected
             figure; a multi-bill one cannot have changed, because the check
             above refuses that. */
          allocations: {
            create: old.allocations.map((a) => ({
              invoiceId: a.invoiceId,
              /* The CARGO half on a one-bill split — the fare answers no bill,
                 and allocating it makes the claim impossible to verify. */
              amount:
                old.allocations.length === 1
                  ? new Prisma.Decimal(
                      Math.round((parsed.data.amount - oldFare) * 100) / 100
                    )
                  : a.amount,
            })),
          },
          /* The same files, not re-uploaded. The refused claim keeps its own
             rows, so what Finance was looking at when they said no survives. */
          proofs: {
            create: [...old.proofs, ...uploaded].map((proof) => ({
              url: proof.url,
              contentType: proof.contentType,
              bytes: proof.bytes,
              filename: proof.filename,
              uploadedById: user.id,
            })),
          },
        },
        select: { id: true, submissionNumber: true },
      });

      await recordAudit(
        {
          actor: user,
          action: "submission.resubmit",
          entity: "PaymentSubmission",
          entityId: fresh.id,
          summary: withNote(
            `${fresh.submissionNumber} raised again in place of ${old.submissionNumber} (${old.invoice.invoiceNumber})`,
            parsed.data.reason
          ),
          metadata: {
            replaces: old.submissionNumber,
            amount: parsed.data.amount,
            currency: parsed.data.currency,
            account: account.name,
            reason: parsed.data.reason ?? null,
            evidenceAdded: uploaded.length,
          },
        },
        tx
      );

      return fresh;
    }).catch((error: unknown) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new Error(
          `${old.submissionNumber} was raised again by somebody else a moment ago. Reload to see the new claim.`
        );
      }
      throw error;
    });

    revalidatePath("/app/collections/submissions");
    revalidatePath("/app/collections/verify");
    revalidatePath("/app/collections/follow-up");
    revalidatePath("/app/support");
    return { ok: true, data: { submissionNumber: result.submissionNumber } };
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
