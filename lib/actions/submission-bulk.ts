"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { t } from "@/lib/i18n";
import { prisma } from "@/lib/prisma";
import { authorize } from "@/lib/session";
import { viewerLocale } from "@/lib/viewer";
import { fail, toActionError, type ActionResult } from "@/lib/actions/types";
import { firstError } from "@/lib/validation";

/**
 * TWENTY-TWO ROWS, ONE DECISION.
 *
 * A desk that has just been handed back twenty-two claims is not making
 * twenty-two decisions about them — it is making one, and then clicking
 * twenty-two times. Same at the verify queue on a busy morning: a screenful of
 * claims from the same day, all with the same answer.
 *
 * WHAT THIS IS NOT. It is not a faster path with looser rules. Every one of
 * these calls the SAME single-row action it would have called by hand, which
 * is where every guard, every audit line, every receipt and every ledger entry
 * lives. Nothing about deciding one claim is reimplemented here; this decides
 * which claims, and in what order.
 *
 * ONE BAD ROW MUST NOT LOSE THE OTHERS. Each claim is its own transaction,
 * exactly as it is when clicked. A claim somebody else decided a second ago,
 * or one whose bill has been settled at the counter meanwhile, fails on its
 * own and is named in the result — the other twenty-one still happen. The
 * alternative is a single transaction where one stale row silently undoes a
 * morning's work.
 */

const idsSchema = z.object({
  /** Sent as JSON because a FormData list of the same key is easy to truncate
      silently, and this list decides what happens to real money. */
  ids: z
    .string()
    .min(2, "Nothing was selected.")
    .transform((raw, ctx) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "The selection could not be read." });
        return z.NEVER;
      }
      const rows = z.array(z.string().min(1)).min(1).max(200).safeParse(parsed);
      if (!rows.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Select between one and 200 claims at a time.",
        });
        return z.NEVER;
      }
      /* The same claim twice would be decided twice; the guards would refuse
         the second, but the count reported back would be a lie. */
      return [...new Set(rows.data)];
    }),
});

export type BulkOutcome = {
  done: number;
  failed: { name: string; why: string }[];
  /** One sentence naming what did not happen, for the bar to read back. Null
      when everything went through, which is the ordinary case. */
  note: string | null;
};

/** What to say when it worked for some and not others. */
function summarise(locale: "en" | "zh", done: number, failed: BulkOutcome["failed"]) {
  if (failed.length === 0) return null;
  const heads = failed.slice(0, 3).map((f) => `${f.name}: ${f.why}`);
  const rest =
    failed.length > 3 ? ` ${t(locale, "and")} ${failed.length - 3} ${t(locale, "more")}` : "";
  return `${done} ${t(locale, "done")}, ${failed.length} ${t(locale, "could not be")}. ${heads.join(" · ")}${rest}`;
}

/**
 * Take back several claims at once.
 *
 * Withdrawal is the honest word for what the button says: nothing is deleted,
 * because a claim is a record that somebody said a customer had paid, and that
 * stays true whatever is decided afterwards. The row goes to WITHDRAWN with a
 * reason, the bill is untouched, and the cargo simply returns to the chase
 * list to be recorded again from scratch.
 */
export async function withdrawSubmissions(
  _prev: ActionResult<BulkOutcome> | undefined,
  formData: FormData
): Promise<ActionResult<BulkOutcome>> {
  const locale = await viewerLocale();
  try {
    /* The same permission the single-row control asks for. The per-claim
       ownership rule — your own, unless you may verify — is enforced inside
       withdrawSubmission for every id, not restated here where it could
       drift. */
    await authorize("payment.submit");

    const parsed = z
      .object({
        ids: idsSchema.shape.ids,
        /*
          NOT ASKED FOR, AND NOT INVENTED EITHER.

          The single-row control asks why, because deciding one claim is a
          considered act. Deciding twenty is one act, and stopping to write a
          sentence about each — or one sentence pretending to explain all of
          them — is friction that buys nothing: the audit line already records
          who did it and when.

          So the column says exactly what happened, including the fact that
          nobody gave a reason. That is more honest than a default sentence
          dressed up as an explanation, and it is what somebody reading the row
          in six months actually needs to know.
        */
        reason: z.string().trim().optional(),
      })
      .safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));
    const reason =
      parsed.data.reason && parsed.data.reason.length >= 3
        ? parsed.data.reason
        : "Taken back from the list — no reason given.";

    const { withdrawSubmission } = await import(
      "@/lib/actions/submission-corrections"
    );

    /* Named before anything is decided, so a claim that disappears mid-run is
       still reportable by its number rather than by an id nobody can read. */
    const named = await prisma.paymentSubmission.findMany({
      where: { id: { in: parsed.data.ids } },
      select: { id: true, submissionNumber: true },
    });
    const nameOf = new Map(named.map((s) => [s.id, s.submissionNumber]));

    const failed: BulkOutcome["failed"] = [];
    let done = 0;

    /* Sequential, deliberately. These share invoices and accounts, and firing
       twenty conditional updateMany claims at one row is how the concurrency
       guards start refusing each other. A desk waiting two seconds is a better
       outcome than half a list failing with "somebody decided this a moment
       ago" — which would be us. */
    for (const id of parsed.data.ids) {
      const one = new FormData();
      one.set("submissionId", id);
      one.set("reason", reason);
      const result = await withdrawSubmission(undefined, one);
      if (result.ok) done += 1;
      else failed.push({ name: nameOf.get(id) ?? id, why: result.error ?? "Refused." });
    }

    revalidatePath("/app/collections/submissions");
    revalidatePath("/app/collections/follow-up");
    revalidatePath("/app/support");

    const note = summarise(locale, done, failed);
    if (done === 0) return fail(note ?? t(locale, "Nothing could be taken back."));
    return { ok: true, data: { done, failed, note } };
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}

/**
 * Agree several claims at once.
 *
 * Hands each to verifyPaymentSubmission — the same action the single button
 * calls — so every one produces its own payment, receipt, ledger entries and
 * pickup note exactly as it would have.
 *
 * THE ACCOUNT IS THE ONE THE CLAIM NAMES. Verifying by hand asks Finance where
 * the money landed, because that is their decision and Support does not know.
 * In bulk there is no screen to ask on, so a claim that already names an
 * account is agreed against that account, and one that does not is SKIPPED and
 * said so. Guessing an account here would put money into a register in a place
 * nobody chose, which is the one thing this system has never done.
 */
export async function verifySubmissions(
  _prev: ActionResult<BulkOutcome> | undefined,
  formData: FormData
): Promise<ActionResult<BulkOutcome>> {
  const locale = await viewerLocale();
  try {
    await authorize("payment.verify");
    const parsed = idsSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return fail(t(locale, firstError(parsed.error)));

    /* Read once, so a claim can be named in the result and the two conditions
       this run decides for itself — still pending, and it says where the money
       landed — are answered before anything is agreed. Every OTHER rule stays
       inside verifyPaymentSubmission, where clicking one row would meet it. */
    const rows = await prisma.paymentSubmission.findMany({
      where: { id: { in: parsed.data.ids } },
      select: {
        id: true,
        submissionNumber: true,
        status: true,
        accountId: true,
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));

    const { verifyPaymentSubmission } = await import("@/lib/actions/collections");

    const failed: BulkOutcome["failed"] = [];
    let done = 0;

    for (const id of parsed.data.ids) {
      const row = byId.get(id);
      if (!row) {
        failed.push({ name: id, why: t(locale, "No longer exists.") });
        continue;
      }
      if (row.status !== "PENDING") {
        failed.push({
          name: row.submissionNumber,
          why: t(locale, "Already dealt with."),
        });
        continue;
      }
      /*
        The claim has to say where the money landed, because this run cannot
        ask. Older claims were raised before naming an account was compulsory
        and are exactly the rows this would otherwise book into nowhere — they
        are opened and decided one at a time, which is the right amount of
        attention for a claim nobody can say the destination of.
      */
      if (!row.accountId) {
        failed.push({
          name: row.submissionNumber,
          why: t(locale, "No account named — open it and say where it landed."),
        });
        continue;
      }
      const one = new FormData();
      one.set("submissionId", id);
      one.set("accountId", row.accountId);
      const result = await verifyPaymentSubmission(undefined, one);
      if (result.ok) done += 1;
      else
        failed.push({
          name: row.submissionNumber,
          why: result.error ?? "Refused.",
        });
    }

    revalidatePath("/app/collections/verify");
    revalidatePath("/app/collections/submissions");
    revalidatePath("/app/finance/payments");
    revalidatePath("/app/finance/transactions");

    const note = summarise(locale, done, failed);
    if (done === 0) return fail(note ?? t(locale, "Nothing could be verified."));
    return { ok: true, data: { done, failed, note } };
  } catch (error) {
    return fail(t(locale, toActionError(error)));
  }
}
